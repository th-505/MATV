#!/usr/bin/env python3
"""Check source parity and build recipes; does not build or certify releases."""
import json
import re
import subprocess
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = json.loads((ROOT / 'docs/platform-parity.json').read_text())


def read(path):
    return (ROOT / path).read_text()


class Elements(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.ids = {}
        self.stack = []
        self.feed(html)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if attrs.get('id'):
            if attrs['id'] in self.ids:
                raise AssertionError(f'Duplicate HTML id {attrs["id"]}')
            self.ids[attrs['id']] = (tag, attrs, list(self.stack))
        if tag not in {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}:
            self.stack.append((tag, attrs.get('id')))

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break


class PlatformParity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.web = read('docs/legacy/index.html.source')
        cls.dart = read('flutter_app/lib/main.dart')
        cls.native_contract = read(CONTRACT['shared_contract_sources']['flutter'])
        cls.release = read('.github/workflows/mobile-trial.yml')
        # Execute the actual public Web routing resolver, without a DOM or network.
        result = subprocess.run(['node', '--input-type=module', '-e', '''
import { UI_CONTRACT, resolveNavigationTab } from './web/core/ui-contract.js';
console.log(JSON.stringify({contract:UI_CONTRACT,
 routes:Object.fromEntries([...UI_CONTRACT.navigation.map(item=>item.id),'explore','invalid-route'].map(id=>[id,resolveNavigationTab(id)]))}));
'''], cwd=ROOT, capture_output=True, text=True, check=True)
        cls.web_contract = json.loads(result.stdout)

    def test_cross_source_navigation_and_alias_semantics(self):
        expected = [item['id'] for item in CONTRACT['navigation']]
        self.assertEqual([item['id'] for item in self.web_contract['contract']['navigation']], expected)
        page_ids = re.search(r'pageIds\s*=\s*<String>\[(.*?)\]', self.native_contract, re.S)
        self.assertIsNotNone(page_ids, 'Dart contract pageIds missing')
        self.assertEqual(re.findall(r"'([^']+)'", page_ids[1]), expected)
        for route in expected:
            self.assertEqual(self.web_contract['routes'][route], route)
        self.assertEqual(self.web_contract['routes']['explore'], 'search')
        self.assertEqual(self.web_contract['routes']['invalid-route'], 'home')
        self.assertIn("import 'src/ui_contract.dart'", self.dart)
        self.assertIn('NajdUi.pageIds', self.dart)
        self.assertIn('UI_CONTRACT.navigation', self.web)

    def test_each_web_destination_has_content_and_search_contains_explore(self):
        dom = Elements(self.web)
        for item in CONTRACT['navigation']:
            self.assertIn('tab-' + item['id'], dom.ids, f'Orphan route {item["id"]}')
        self.assertEqual(dom.ids['advancedSearch'][0], 'details')
        self.assertIn('tab-search', [item[1] for item in dom.ids['advancedSearch'][2]])
        self.assertIn(('details', 'advancedSearch'), dom.ids['exploreProvider'][2])
        self.assertIn('tab-search', [item[1] for item in dom.ids['searchForm'][2]])
        self.assertIn("document.getElementById('tab-' + tabId)", self.web)
        self.assertIn("#/title", self.web)
        self.assertIn("#/watch", self.web)

    def test_theme_brand_and_sidebar_contract(self):
        web = self.web_contract['contract']
        self.assertEqual(web['name'], CONTRACT['product'])
        self.assertEqual(web['direction'], 'rtl')
        self.assertEqual(web['navigationSide'], 'right')
        self.assertEqual(web['desktopBreakpoint'], CONTRACT['navigation_layout']['permanent_min_width'])
        self.assertTrue(web['topBar'])
        self.assertTrue(web['bottomNavigation'])
        theme_keys = {'background':'background','surface':'surface','elevated':'elevated',
                      'accent':'gold','accent_light':'goldLight','accent_dark':'goldDark',
                      'text':'text','secondary_text':'textSecondary'}
        dart_keys = {'background':'background','surface':'surface','elevated':'elevated',
                     'accent':'accent','accent_light':'accentLight','accent_dark':'accentDark',
                     'text':'text','secondary_text':'secondaryText'}
        for key, value in CONTRACT['theme'].items():
            self.assertEqual(web['theme'][theme_keys[key]].lower(), value)
            match = re.search(r'\b' + dart_keys[key] + r'\s*=\s*Color\(0xFF([0-9a-f]{6})\)', self.native_contract, re.I)
            self.assertIsNotNone(match, f'Native theme token missing: {key}')
            self.assertEqual('#' + match[1].lower(), value)
        self.assertIn("brand = 'نجد — Najd TV'", self.native_contract)
        self.assertRegex(self.native_contract, r'sidebarBreakpoint\s*=\s*900(?:\.0)?;')
        # These are integration boundaries, not a visual or device acceptance claim.
        self.assertIn('NajdUi.sidebarBreakpoint', self.dart)
        self.assertIn('TextDirection.rtl', self.dart)
        self.assertIn('isTvTarget', self.dart)
        self.assertIn('isDesktopTarget', self.dart)
        shell = self.dart[self.dart.index('class Shell'):self.dart.index('class HomePage')]
        self.assertIn('bottomNavigationBar: NavigationBar(', shell)
        self.assertIn('NajdUi.bottomPages', shell)
        self.assertIn('ImageFilter.blur', shell)
        self.assertIn('tatv-open-navigation', shell)

    def test_native_search_route_is_not_catalog_or_hidden_setting(self):
        expected = [item['id'] for item in CONTRACT['navigation']]
        search_index = expected.index('search')
        self.assertRegex(self.dart, rf'{search_index}\s*=>\s*SearchPage\(')
        search = self.dart[self.dart.index('class SearchPage'):]
        self.assertIn('widget.api.searchTmdb(q)', search)
        self.assertIn('widget.api.explore(q, selectedSource!)', search)
        self.assertIn('search-advanced-toggle', search)
        self.assertIn('if (advanced)', search)
        self.assertIn('selectedSource == null', search)

    def test_shared_native_player_and_api_define(self):
        player = read('flutter_app/lib/src/universal_player.dart')
        self.assertIn("package:media_kit/media_kit.dart", player)
        self.assertIn('mk.Media(uri.toString()', player)
        self.assertIn('httpHeaders: kIsWeb ? const {} : headers', player)
        self.assertIn("'MITV_API_BASE'", read('flutter_app/lib/src/api_client.dart'))
        commands = re.findall(r'^.*flutter build (?:apk|ios|windows|macos).*$', self.release, re.M)
        self.assertTrue(commands)
        for command in commands:
            self.assertIn('--dart-define=', command)
            self.assertIn('MITV_API_BASE', command)
        web_recipe = read('.github/workflows/flutter-web.yml')
        self.assertRegex(web_recipe, r'flutter build web[^\n]*MITV_API_BASE')
        self.assertIn('flutter_app', web_recipe)

    def test_target_scaffolding_and_tv_manifest_behavior(self):
        for platform in ('android', 'ios', 'windows', 'macos'):
            self.assertRegex(self.release, rf'flutter create --platforms={platform}\b')
        self.assertIn('target: mobile', self.release)
        self.assertIn('target: tv', self.release)
        self.assertIn('configure_tv_manifest.py flutter_app', self.release)
        self.assertNotRegex(self.release, r'flutter build linux\b')
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'android/app/src/main/AndroidManifest.xml'
            path.parent.mkdir(parents=True)
            path.write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application><activity><intent-filter><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>')
            for _ in range(2):
                subprocess.run(['python3', str(ROOT / 'scripts/configure_tv_manifest.py'), temp], check=True, capture_output=True)
            root = ET.parse(path).getroot()
            android = '{http://schemas.android.com/apk/res/android}'
            features = {node.get(android+'name'):node.get(android+'required') for node in root.findall('uses-feature')}
            self.assertEqual(features['android.software.leanback'], 'true')
            self.assertEqual(features['android.hardware.touchscreen'], 'false')
            leanback = [node for node in root.findall('.//category') if node.get(android+'name') == 'android.intent.category.LEANBACK_LAUNCHER']
            self.assertEqual(len(leanback), 1, 'TV manifest transformation must be idempotent')

    def test_source_provenance_writer_binds_exact_api_and_commit(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'source.json'
            command = ['python3', str(ROOT / 'scripts/write_source_manifest.py'), '--target', 'test-source', '--output', str(path), '--api', 'https://example.com', '--sha', 'a'*40, '--pubspec', str(ROOT / 'flutter_app/pubspec.yaml')]
            subprocess.run(command, check=True, capture_output=True)
            record = json.loads(path.read_text())
            self.assertEqual(record['source_commit'], 'a'*40)
            self.assertEqual(record['api_base'], 'https://example.com')
            self.assertEqual(record['target'], 'test-source')
            invalid = command.copy()
            invalid[invalid.index('https://example.com')] = 'http://example.com'
            self.assertNotEqual(subprocess.run(invalid, capture_output=True).returncode, 0)

    def test_manifest_install_entrypoints_do_not_redirect_to_legacy_bundle(self):
        manifest = json.loads(read('manifest.json'))
        self.assertEqual(manifest['name'], CONTRACT['product'])
        self.assertEqual(manifest['start_url'], './')
        self.assertEqual(manifest['dir'], 'rtl')
        self.assertIn('index.html', [item['source'] for item in CONTRACT['platforms']])
        old = json.loads(read('app/source-manifest.json'))
        self.assertEqual(old['target'], 'web')
        self.assertRegex(old['source_commit'], r'^[0-9a-f]{40}$')
        self.assertFalse(CONTRACT['release_gate']['old_app_bundle_rebuilt_in_this_task'])
        self.assertFalse(CONTRACT['release_gate']['source_checks_are_build_proof'])
        print(f'NOTICE: app/ bundle declares {old["version"]}+{old["build"]} at {old["source_commit"]}; no rebuild/device certification asserted.')


if __name__ == '__main__':
    unittest.main(verbosity=2)
