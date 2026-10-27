"""Verify all six Najd TV release targets and their common source provenance."""
import hashlib
import json
import plistlib
import struct
import sys
import zipfile
from pathlib import Path


root = Path(sys.argv[1])
api = sys.argv[2].rstrip('/')
version = sys.argv[3]
build = int(sys.argv[4])
source_sha = sys.argv[5] if len(sys.argv) > 5 else None
assert source_sha and len(source_sha) == 40, 'Expected the full source commit SHA'
results = []
targets = {}


def unique_file(name):
    matches = list(root.rglob(name))
    assert len(matches) == 1, f'Missing or duplicate artifact: {name}'
    return matches[0]


def verify_sha(path):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    checksum = Path(str(path) + '.sha256')
    assert checksum.is_file(), f'Missing checksum for {path.name}'
    first = checksum.read_text(encoding='ascii').split()[0].lower()
    assert digest == first, f'Checksum mismatch for {path.name}'
    return digest


def record(path, target, architecture):
    digest = verify_sha(path)
    results.append({
        'file': path.name,
        'target': target,
        'architecture': architecture,
        'sha256': digest,
        'bytes': path.stat().st_size,
        'verified': True,
    })
    return digest


def verify_manifest(path, target):
    manifest = json.loads(path.read_text(encoding='utf-8'))
    assert manifest.get('schema_version') == 1
    assert manifest.get('product') == 'Najd TV'
    assert manifest.get('version') == version
    assert manifest.get('build') == build
    assert manifest.get('api_base', '').rstrip('/') == api
    assert manifest.get('source_commit') == source_sha
    actual_target = manifest.get('target')
    assert actual_target == target, f'{path}: expected target {target}, got {actual_target}'
    assert target not in targets, f'Duplicate target manifest: {target}'
    targets[target] = path


for filename, abi, machine, target in [
    ('Najd-TV-Android-Mobile-ARM64.apk', 'arm64-v8a', 183, 'android-mobile-arm64'),
    ('Najd-TV-Android-TV-ARM32.apk', 'armeabi-v7a', 40, 'android-tv-armv7'),
]:
    apk = unique_file(filename)
    assert apk.stat().st_size <= 35 * 1024 * 1024, f'{filename} exceeds 35 MiB'
    with zipfile.ZipFile(apk) as archive:
        names = archive.namelist()
        abis = {entry.split('/')[1] for entry in names if entry.startswith('lib/') and entry.endswith('.so')}
        assert abis == {abi}, f'{filename}: unexpected ABIs {abis}'
        assert f'lib/{abi}/libmpv.so' in names, f'{filename}: media codecs missing'
        assert api.encode() in archive.read(f'lib/{abi}/libapp.so'), f'{filename}: API base missing'
        for entry in names:
            if entry.startswith(f'lib/{abi}/') and entry.endswith('.so'):
                native = archive.read(entry)
                assert native[:4] == b'\x7fELF' and struct.unpack('<H', native[18:20])[0] == machine, entry
    record(apk, target, abi)
    verify_manifest(apk.parent / 'source-manifest.json', target)


ipa = unique_file('Najd-TV-iPhone-Unsigned.ipa')
with zipfile.ZipFile(ipa) as archive:
    names = archive.namelist()
    app = 'Payload/Runner.app/'
    assert app + 'embedded.mobileprovision' not in names
    assert not any(entry.startswith(app + '_CodeSignature/') for entry in names)
    info = plistlib.loads(archive.read(app + 'Info.plist'))
    assert info['CFBundleShortVersionString'] == version
    assert info['CFBundleVersion'] == str(build)
    assert info['CFBundleDisplayName'] == 'Najd TV'
    assert info['CFBundleIdentifier'] == 'com.mitv.mitv'
    assert info.get('UIFileSharingEnabled') is True
    assert info.get('NSAppTransportSecurity', {}).get('NSAllowsLocalNetworking') is True
    runner = archive.read(app + 'Runner')
    assert struct.unpack('<I', runner[4:8])[0] == 0x100000C
    assert api.encode() in archive.read(app + 'Frameworks/App.framework/App')
record(ipa, 'ios-unsigned-arm64', 'arm64')
verify_manifest(ipa.parent / 'source-manifest.json', 'ios-unsigned-arm64')


windows_zip = unique_file('Najd-TV-Windows-x64.zip')
windows_setup = unique_file('Najd-TV-Windows-x64-Setup.exe')


def pe_machine(data):
    assert data[:2] == b'MZ'
    offset = struct.unpack('<I', data[0x3c:0x40])[0]
    assert data[offset:offset + 4] == b'PE\0\0'
    return struct.unpack('<H', data[offset + 4:offset + 6])[0]


with zipfile.ZipFile(windows_zip) as archive:
    names = archive.namelist()
    exe = next(name for name in names if name.lower().endswith('mitv.exe'))
    assert pe_machine(archive.read(exe)) == 0x8664
    dlls = [name for name in names if name.lower().endswith('.dll')]
    assert any('mpv' in name.lower() for name in dlls), 'Windows libmpv missing'
    assert all(pe_machine(archive.read(name)) == 0x8664 for name in dlls)
    snapshot = next(name for name in names if name.endswith('app.so'))
    assert api.encode() in archive.read(snapshot), 'Windows API missing'
record(windows_zip, 'windows-x64', 'x64')
record(windows_setup, 'windows-x64', 'x64')
verify_manifest(windows_zip.parent / 'source-manifest.json', 'windows-x64')


mac_dmg = unique_file('Najd-TV-macOS-Unsigned.dmg')
mac_report_path = unique_file('macOS-report.json')
mac_report = json.loads(mac_report_path.read_text(encoding='utf-8'))
assert mac_report.get('product') == 'Najd TV'
assert mac_report.get('version') == version and str(mac_report.get('build')) == str(build)
assert mac_report.get('dmg') == mac_dmg.name
assert mac_report.get('sha256') == hashlib.sha256(mac_dmg.read_bytes()).hexdigest()
assert mac_report.get('notarized') is False
assert mac_report.get('signature', '').startswith('ad-hoc;')
architectures = set(mac_report.get('architectures') or [])
assert architectures and architectures <= {'arm64', 'x86_64'}
record(mac_dmg, 'macos-native', '/'.join(sorted(architectures)))
verify_manifest(mac_dmg.parent / 'source-manifest.json', 'macos-native')


web_zip = unique_file('Najd-TV-Web.zip')
with zipfile.ZipFile(web_zip) as archive:
    names = archive.namelist()
    assert 'index.html' in names and 'main.dart.js' in names
    manifest = json.loads(archive.read('source-manifest.json'))
    assert manifest.get('target') == 'web'
    assert manifest.get('version') == version and manifest.get('build') == build
    assert manifest.get('api_base', '').rstrip('/') == api
    assert manifest.get('source_commit') == source_sha
    assert api.encode() in archive.read('main.dart.js'), 'Web API missing from bundle'
record(web_zip, 'web', 'browser')
verify_manifest(web_zip.parent / 'source-manifest.json', 'web')

required_targets = {
    'android-mobile-arm64', 'android-tv-armv7', 'ios-unsigned-arm64',
    'windows-x64', 'macos-native', 'web',
}
assert set(targets) == required_targets, f'Incomplete target manifests: {sorted(targets)}'
print(json.dumps({
    'product': 'Najd TV',
    'version': version,
    'build': build,
    'source_commit': source_sha,
    'api_base': api,
    'targets': sorted(targets),
    'artifacts': results,
}, indent=2))
