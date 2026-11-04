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
    assert actual.count('"Najd TV" "\\0"') == 3
    assert 'old value' not in actual
    assert (runner / 'main.cpp').read_text(encoding='utf-8') == '  if (!window.Create(L"Najd TV", origin, size)) {'
    first = actual
    branding.apply_windows(root)
    assert (runner / 'Runner.rc').read_text(encoding='utf-8') == first
print('native branding identity and Windows resource output are stable and idempotent')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    native = root / 'android/app/src/main'
    activity = native / 'kotlin/com/mitv/mitv/MainActivity.kt'
    activity.parent.mkdir(parents=True)
    activity.write_text('package com.mitv.mitv\nclass MainActivity {}\n')
    manifest = native / 'AndroidManifest.xml'
    manifest.write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="mitv"><activity android:name=".MainActivity" /></application></manifest>')
    branding.apply_android(root)
    assert 'android:supportsPictureInPicture="true"' in manifest.read_text()
    assert 'android:resizeableActivity="true"' in manifest.read_text()
    assert 'package com.mitv.mitv' in activity.read_text()
    assert '__NAJD_PACKAGE__' not in activity.read_text()
    assert 'enterPictureInPictureMode' in activity.read_text()
    first = manifest.read_text()
    branding.apply_android(root)
    assert manifest.read_text() == first
    runner = root / 'ios/Runner'
    runner.mkdir(parents=True)
    import plistlib
    (runner / 'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier': 'com.mitv.mitv'}))
    (runner / 'AppDelegate.swift').write_text('import Flutter')
    branding.apply_ios(root)
    info = plistlib.loads((runner / 'Info.plist').read_bytes())
    assert info['CFBundleIdentifier'] == 'com.mitv.mitv'
    assert 'audio' in info['UIBackgroundModes']
    assert 'AVPictureInPictureController' in (runner / 'AppDelegate.swift').read_text()
print('Android and iOS packaging preserve compatibility identities and install OS PiP bridges')
