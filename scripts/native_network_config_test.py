"""Validate generated bridge permissions before Android release lint runs."""
import sys
sys.dont_write_bytecode = True
import importlib.util
import plistlib
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
spec = importlib.util.spec_from_file_location('branding', Path(__file__).with_name('apply_native_branding.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    manifest = root / 'android/app/src/main/AndroidManifest.xml'
    manifest.parent.mkdir(parents=True)
    manifest.write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="MATV"/></manifest>')
    ios = root / 'ios/Runner/Info.plist'
    ios.parent.mkdir(parents=True)
    ios.write_bytes(plistlib.dumps({}))
    module.apply_android(root)
    module.apply_android(root)
    module.apply_ios(root)
    xml = ET.parse(root / 'android/app/src/main/res/xml/network_security_config.xml').getroot()
    assert xml.find('base-config').get('cleartextTrafficPermitted') == 'false'
    domains = xml.findall('domain-config/domain')
    assert {d.text for d in domains} == {'127.0.0.1', 'localhost'}
    assert all(d.get('includeSubdomains') == 'false' for d in domains)
    application = ET.parse(manifest).getroot().find('application')
    assert application.get('{http://schemas.android.com/apk/res/android}networkSecurityConfig') == '@xml/network_security_config'
    assert plistlib.loads(ios.read_bytes())['NSAppTransportSecurity']['NSAllowsLocalNetworking'] is True
print('Native stream bridge security config: lint-required attributes, loopback-only scope, idempotence and iOS ATS passed')
