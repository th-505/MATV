"""Verify downloaded MITV trial artifacts without unpacking apps or signing keys."""
import hashlib
import json
import plistlib
import struct
import sys
import zipfile
from pathlib import Path

root = Path(sys.argv[1])
api = sys.argv[2].encode()
version = sys.argv[3] if len(sys.argv) > 3 else '1.0.36'
build = int(sys.argv[4]) if len(sys.argv) > 4 else 36
results = []
for name, abi, machine in [
    ('MITV-Android-Mobile-ARM64.apk', 'arm64-v8a', 183),
    ('MITV-Android-TV-ARM32.apk', 'armeabi-v7a', 40),
    ('MITV-iPhone-Unsigned.ipa', None, None),
]:
    matches = list(root.rglob(name))
    assert len(matches) == 1, f'Missing or duplicate artifact: {name}'
    path = matches[0]
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    assert digest == Path(str(path) + '.sha256').read_text().split()[0], name
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if abi:
            abis = {entry.split('/')[1] for entry in names if entry.startswith('lib/') and entry.endswith('.so')}
            assert abis == {abi}, f'{name}: unexpected architectures {abis}'
            if build >= 39:
                assert f'lib/{abi}/libmpv.so' in names, f'{name}: extended decoder missing'
                for entry in names:
                    if entry.startswith(f'lib/{abi}/') and entry.endswith('.so'):
                        native = archive.read(entry)
                        assert native[:4] == b'\x7fELF' and struct.unpack('<H', native[18:20])[0] == machine, entry
            binary = archive.read(f'lib/{abi}/libapp.so')
            assert binary[:4] == b'\x7fELF'
            assert struct.unpack('<H', binary[18:20])[0] == machine
        else:
            app = 'Payload/Runner.app/'
            assert app + 'embedded.mobileprovision' not in names
            assert not any(entry.startswith(app + '_CodeSignature/') for entry in names)
            info = plistlib.loads(archive.read(app + 'Info.plist'))
            assert info['CFBundleShortVersionString'] == version
            assert info['CFBundleVersion'] == str(build)
            if build>=43:
                assert info['CFBundleDisplayName']=='MITV'
                assert info['CFBundleIdentifier']=='com.mitv.mitv'
                assert info.get('UIFileSharingEnabled') is True
            if build >= 40:
                assert info.get('NSAppTransportSecurity', {}).get('NSAllowsLocalNetworking') is True, 'iOS local stream bridge disabled'
            runner = archive.read(app + 'Runner')
            assert struct.unpack('<I', runner[4:8])[0] == 0x100000C
            if build >= 39:
                decoder = archive.read(app + 'Frameworks/Mpv.framework/Mpv')
                if decoder[:4] == b'\xcf\xfa\xed\xfe':
                    assert struct.unpack('<I', decoder[4:8])[0] == 0x100000C, 'iOS decoder must be ARM64'
                else:
                    assert decoder[:4] == b'\xca\xfe\xba\xbe', 'Unknown iOS decoder format'
                    count = struct.unpack('>I', decoder[4:8])[0]
                    assert all(struct.unpack('>I',decoder[8+i*20:12+i*20])[0] == 0x100000C for i in range(count)), 'Simulator slice in iOS decoder'
            binary = archive.read(app + 'Frameworks/App.framework/App')
        assert api in binary, f'{name}: deployed API is absent'
    results.append({'file': name, 'architecture': abi or 'arm64', 'sha256': digest,
                    'bytes': path.stat().st_size, 'api': api.decode(), 'verified': True})
if build >= 43:
    bundles = list(root.rglob('MITV-Windows-x64.zip'))
    assert len(bundles) == 1, 'Missing Windows bundle'
    bundle=bundles[0]
    def pe_machine(data):
        assert data[:2]==b'MZ'
        offset=struct.unpack('<I',data[0x3c:0x40])[0]
        assert data[offset:offset+4]==b'PE\0\0'
        return struct.unpack('<H',data[offset+4:offset+6])[0]
    with zipfile.ZipFile(bundle) as archive:
        names=archive.namelist()
        exe=next(n for n in names if n.endswith('mitv.exe'))
        assert pe_machine(archive.read(exe))==0x8664, 'MITV must be x64'
        dlls=[n for n in names if n.lower().endswith('.dll')]
        assert any('mpv' in n.lower() for n in dlls), 'Windows decoder missing'
        assert all(pe_machine(archive.read(n))==0x8664 for n in dlls)
        snapshot=next(n for n in names if n.endswith('app.so'))
        assert api in archive.read(snapshot), 'Windows deployed API missing'
    for name in ['MITV-Windows-x64.zip','MITV-Windows-x64-Setup.exe']:
        path=next(root.rglob(name));digest=hashlib.sha256(path.read_bytes()).hexdigest()
        assert digest==Path(str(path)+'.sha256').read_text().split()[0]
        if name.endswith('.exe'):assert pe_machine(path.read_bytes()) in (0x14c,0x8664)
        results.append({'file':name,'architecture':'x64','sha256':digest,'bytes':path.stat().st_size,'api':api.decode(),'verified':True})
print(json.dumps(results, indent=2))
