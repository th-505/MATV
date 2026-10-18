import importlib.util
import tempfile
from pathlib import Path

module_spec = importlib.util.spec_from_file_location('apply_native_branding', Path(__file__).with_name('apply_native_branding.py'))
branding = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(branding)

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    runner = root / 'windows' / 'runner'
    runner.mkdir(parents=True)
    (runner / 'main.cpp').write_text('  if (!window.Create(L"old title", origin, size)) {', encoding='utf-8')
    (runner / 'Runner.rc').write_text('\n'.join(
        f'VALUE "{key}", "old value" "\\0"' for key in ('CompanyName', 'FileDescription', 'ProductName')
    ), encoding='utf-8')
    branding.apply_windows(root)
    actual = (runner / 'Runner.rc').read_text(encoding='utf-8')
    assert actual.count('"MA TV" "\\0"') == 3
    assert 'old value' not in actual
    assert (runner / 'main.cpp').read_text(encoding='utf-8') == '  if (!window.Create(L"MA TV", origin, size)) {'
    first = actual
    branding.apply_windows(root)
    assert (runner / 'Runner.rc').read_text(encoding='utf-8') == first
print('native branding identity and Windows resource output are stable and idempotent')

import json
import struct
with tempfile.TemporaryDirectory() as directory:
    root=Path(directory)
    (root/'android').mkdir()
    branding.apply_android(root)
    banner=root/'android/app/src/main/res/drawable/tv_banner.png'
    assert struct.unpack('>II',banner.read_bytes()[16:24]) == (320,180)
    for platform in ('ios','macos'):
        icons=root/platform/'Runner/Assets.xcassets/AppIcon.appiconset'
        icons.mkdir(parents=True)
        (icons/'Contents.json').write_text(json.dumps({'images':[{'size':'16x16','scale':'2x','filename':'icon32.png'}]}))
        getattr(branding,'apply_'+platform)(root)
        assert struct.unpack('>II',(icons/'icon32.png').read_bytes()[16:24]) == (32,32)
print('iOS/macOS icon generation and 320×180 Android TV banner dimensions passed')
