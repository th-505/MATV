#!/usr/bin/env python3
"""Inventory code declarations without importing scrapers or contacting providers.

Run from any directory: python3 scripts/provider_inventory.py [--check].
A declared capability and an exported function are evidence of wiring, never of
successful network extraction. Unsupported JS expressions remain explicit.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'مهام' / 'تقارير'
JSON_PATH = OUT / 'المصادر.json'
MD_PATH = OUT / 'المصادر.md'
FEATURES = {'catalog': 'scrapeCatalog', 'search': 'scrapeSearch', 'details': 'scrapeDetails',
            'episodes': 'scrapeEpisodes', 'servers': 'scrapeServers', 'resolve': 'resolveStream', 'live': 'scrapeLive'}
# These spellings are evidenced by legacy source branches, module exports and UI.
ALIASES = {'akoam': 'akwam', 'wecima': 'mycima'}


def block(source, marker):
    start = source.find(marker)
    if start < 0:
        return None
    start = source.find('{', start + len(marker))
    depth, quote, escaped = 0, None, False
    for pos in range(start, len(source)):
        char = source[pos]
        if quote:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == quote:
                quote = None
        elif char in "'\"`":
            quote = char
        elif char == '{':
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0:
                return source[start:pos + 1]
    raise ValueError(f'Unclosed declaration: {marker}')


def field(source, name, constants):
    match = re.search(r'\b' + re.escape(name) + r'\s*:\s*(null|true|false|\'[^\']*\'|"[^"]*"|[\w.]+)', source)
    if not match:
        return None
    raw = match.group(1)
    if raw in ('null', 'true', 'false'):
        return {'null': None, 'true': True, 'false': False}[raw]
    if raw[:1] in ('\'', '"'):
        return raw[1:-1]
    return constants.get(raw, {'expression': raw})


def inventory():
    files = sorted((ROOT / 'server/scrapers/sites').glob('*.mjs'))
    registry = (ROOT / 'server/scrapers/registry.mjs').read_text()
    engine = (ROOT / 'server/scrapers/index.mjs').read_text()
    html = (ROOT / 'index.html').read_text()
    selector = re.search(r'const exploreSources\s*=\s*\[([^]]*)\]', html)
    ui = re.findall(r"['\"]([\w-]+)['\"]", selector.group(1)) if selector else []
    static_ui = list(ui)
    app_source = (ROOT / 'server/app.mjs').read_text()
    dynamic_ui = '/api/v1/explore/sources' in html and 'listSourceCapabilities()' in app_source
    pinned_block = block(engine, 'const searchers =') or ''
    pinned = re.findall(r'^\s*([\w]+)\s*:', pinned_block, re.M)
    registry_path = ROOT / 'server/scrapers/source-registry.mjs'
    registry_routed = ('searchSource(query, provider)' in engine and registry_path.exists()
                       and 'meta.capabilities?.search === true' in registry_path.read_text()
                       and 'module.scrapeSearch' in registry_path.read_text())
    seed_path = ROOT / 'server/scrapers/providers-registry.json'
    seeds = json.loads(seed_path.read_text()).get('providers', [])
    units = []
    for path in files:
        source = path.read_text()
        meta = block(source, 'export const PROVIDER_META =')
        if meta is None:
            continue
        constants = dict(re.findall(r'(?:export\s+)?const\s+(\w+)\s*=\s*[\'\"]([^\'\"\n]*)[\'\"]', source))
        # Imported aliases used by the only explicit mirror wrappers.
        constants.update({'SHAHID_ID': 'shahid4u', 'CORE_META.id': 'anime4up'})
        declared = {name: field(block(meta, 'capabilities:') or '', name, {}) for name in FEATURES}
        exported = set(re.findall(r'export\s+(?:async\s+)?(?:function|const)\s+(\w+)', source))
        provider_id = field(meta, 'id', constants)
        units.append({
            'id': provider_id, 'name': field(meta, 'name', constants),
            'code': field(meta, 'code', constants), 'mirror_of': field(meta, 'mirrorOf', constants),
            'path': path.relative_to(ROOT).as_posix(),
            'metadata_line': source[:source.index('export const PROVIDER_META')].count('\n') + 1,
            'source_sha256': hashlib.sha256(source.encode()).hexdigest(),
            'registered': f"'./sites/{path.name}'" in registry,
            'declared_capabilities': declared,
            'exported_capabilities': {name: function in exported for name, function in FEATURES.items()},
            'ui_spellings': [name for name in ui if ALIASES.get(name, name) == provider_id],
            'pinned_search_spellings': [name for name in pinned if ALIASES.get(name, name) == provider_id],
            'live_validation': 'not_run',
        })
    if registry_routed:
        pinned = [unit['id'] for unit in units if unit['registered']
                  and unit['declared_capabilities']['search'] is True
                  and unit['exported_capabilities']['search']]
        for unit in units:
            unit['pinned_search_spellings'] = ([unit['id']] + [name for name, target in ALIASES.items() if target == unit['id']]) if unit['id'] in pinned else []
    if dynamic_ui and registry_routed:
        ui = list(pinned)
        for unit in units:
            unit['ui_spellings'] = [unit['id']] if unit['id'] in ui else []
    known = {unit['id'] for unit in units}
    seed_only = [row for row in seeds if ALIASES.get(row['id'], row['id']) not in known]
    duplicates = {}
    for unit in units:
        duplicates.setdefault(unit['code'], []).append(unit['id'])
    adapters = []
    for path in sorted((ROOT / 'server/providers').glob('*.mjs')):
        adapters.append({'path': path.relative_to(ROOT).as_posix(),
                         'canonical_id': ALIASES.get(path.stem, path.stem),
                         'count_as_additional_provider': path.stem not in known and ALIASES.get(path.stem, path.stem) not in known})
    configs = sorted(path.relative_to(ROOT).as_posix() for path in (ROOT / 'edge/config').glob('*')
                     if path.suffix in ('.json', '.jsonc') and path.name != 'episodes.json')
    return {'schema_version': 1, 'scope': 'static repository declarations; no network requests',
            'counts': {'site_modules_with_metadata': len(units),
                       'registered_modules': sum(unit['registered'] for unit in units),
                       'explicit_mirrors': sum(bool(unit['mirror_of']) for unit in units),
                       'not_marked_as_mirror': sum(not unit['mirror_of'] for unit in units),
                       'ui_spellings': len(ui), 'static_ui_array_entries': len(static_ui), 'pinned_search_modules': len(pinned),
                       'seed_only_entries': len(seed_only)},
            'ui_delivery': {'mode': 'capability_endpoint' if dynamic_ui else 'static_array',
                            'endpoint': '/api/v1/explore/sources' if dynamic_ui else None,
                            'live_endpoint_validation': 'not_run'},
            'pinned_search_mode': 'capability_registry' if registry_routed else 'legacy_searchers',
            'aliases': ALIASES, 'units': units, 'seed_only': seed_only,
            'duplicate_codes': {code: ids for code, ids in duplicates.items() if len(ids) > 1},
            'server_adapters': adapters, 'edge_config_files': configs,
            'supervisor_facades': [path.relative_to(ROOT).as_posix() for path in sorted((ROOT / 'server/scrapers').glob('supervisor*.mjs'))],
            'playback_helpers': [path.relative_to(ROOT).as_posix() for path in sorted((ROOT / 'server/providers/3isk-playback').glob('*.mjs'))],
            'compatibility_entrypoints': ['server/basri-source.mjs', 'server/match-production.mjs'],
            'aggregation_modules': [path.relative_to(ROOT).as_posix() for path in files if 'export const PROVIDER_META' not in path.read_text()],
            'warnings': ['Metadata describes intended capabilities, not verified success.',
                         'Modules without mirrorOf are not proof of independent upstream ownership.',
                         'Edge configs and server adapters are additional execution layers, not extra counted sites.',
                         'Seed entries without a registered module are not active providers.']}


def render(data):
    c = data['counts']
    lines = ['# جرد مصادر T-A-TV من الشفرة', '',
             'هذا تقرير آلي ساكن؛ لا يرسل أي طلب للمزودين ولا يثبت نجاح التشغيل.', '',
             f"- وحدات مواقع ذات تعريف PROVIDER_META: **{c['site_modules_with_metadata']}**؛ المسجل منها: **{c['registered_modules']}**.",
             f"- مرآتان مصرح بهما في التعريف: **{c['explicit_mirrors']}**؛ الوحدات غير الموسومة كمرآة: **{c['not_marked_as_mirror']}**. هذا لا يثبت استقلال مالكي المواقع.",
             f"- مصادر الواجهة المستنتجة من الشفرة: **{c['ui_spellings']}**؛ وحدات البحث المثبت المربوطة برمجيًا: **{c['pinned_search_modules']}**.",
             ('- الواجهة تحمل القائمة ديناميكيًا من `/api/v1/explore/sources` وفق سجل القدرات؛ المصفوفة الابتدائية الفارغة لا تعني صفر مصادر. لم يُختبر endpoint المنشور هنا.' if data['ui_delivery']['mode'] == 'capability_endpoint' else '- مصدر قائمة الواجهة مصفوفة ثابتة في index.html.'),
             f"- بذور فحص بلا وحدة مسجلة: **{c['seed_only_entries']}**؛ ليست مزودين عاملين.", '',
             'القدرات أدناه تجمع تصريح metadata ووجود الدالة المصدرة. لا تعني اختبار HTML أو شبكة أو تشغيل فيديو.', '',
             '| المعرف | مرآة لـ | القدرات المعلنة ولها دالة | الواجهة | البحث المثبت | الملف والدليل |',
             '|---|---|---|---|---|---|']
    for unit in data['units']:
        caps = ', '.join(name for name in FEATURES if unit['declared_capabilities'][name] is True and unit['exported_capabilities'][name])
        lines.append(f"| `{unit['id']}` | {unit['mirror_of'] or '—'} | {caps} | {', '.join(unit['ui_spellings']) or '—'} | {', '.join(unit['pinned_search_spellings']) or '—'} | `{unit['path']}:{unit['metadata_line']}` |")
    lines += ['', '## الأسماء البديلة والطبقات', '',
              '- `akoam` في الواجهة وطبقة server/providers يقابل `akwam` في وحدات القشط.',
              '- `wecima` اسم واجهة للمصدر `mycima`؛ ليس ملف موقع مستقلًا.',
              '- `shii4u` مرآة معلنة لـ `shahid4u` و`anime4up_rest` مرآة معلنة لـ `anime4up`.',
              '- طبقة server/providers: ' + '، '.join(f"`{row['path']}`" for row in data['server_adapters']) + '.',
              '- واجهات التنسيق (ليست مزودين جددًا): ' + '، '.join(f'`{path}`' for path in data['supervisor_facades']) + '.',
              '- ملفات استخراج المشغل المساعدة (لا تعد مواقع مستقلة): ' + '، '.join(f'`{path}`' for path in data['playback_helpers']) + '.',
              '- واجهات التوافق: ' + '، '.join(f'`{path}`' for path in data['compatibility_entrypoints']) + '.',
              '- ملفات Edge: ' + '، '.join(f'`{path}`' for path in data['edge_config_files']) + '.',
              '- وحدات التجميع التي لا تعد مواقع جديدة: ' + '، '.join(f'`{path}`' for path in data['aggregation_modules']) + '.', '',
              '## بذور بلا وحدة مسجلة', '',
              '، '.join(f"`{row['id']}`" for row in data['seed_only']) or 'لا توجد.', '',
              '## تعارض الرموز', '',
              *[f"- `{code}` مشترك بين {', '.join(ids)}؛ لا يصلح الرمز وحده معرفًا فريدًا." for code, ids in data['duplicate_codes'].items()], '',
              '## إعادة الإنتاج وحدود الإغلاق', '',
              '`python3 scripts/provider_inventory.py` يولد التقرير وJSON، و`--check` يكشف تقادم النتائج.', '',
              'اكتمل استخراج سجل الشفرة فقط (03.01). تظل فحوص البحث والتفاصيل والمواسم والتشغيل الحي وربط كل المصادر مهام منفصلة مفتوحة. لا يمكن حساب عدد «المزودين العاملين» من هذا التقرير.', '']
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail if generated reports differ from repository code')
    args = parser.parse_args()
    data = inventory()
    outputs = {JSON_PATH: json.dumps(data, ensure_ascii=False, indent=2) + '\n', MD_PATH: render(data)}
    if args.check:
        stale = [str(path.relative_to(ROOT)) for path, content in outputs.items() if not path.exists() or path.read_text() != content]
        if stale:
            print('Stale inventory: ' + ', '.join(stale), file=sys.stderr)
            return 1
    else:
        OUT.mkdir(parents=True, exist_ok=True)
        for path, content in outputs.items():
            path.write_text(content)
    print(json.dumps(data['counts'], ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
