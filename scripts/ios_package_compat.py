"""Audit and normalize our unsigned iPhone package using Apple's tools on macOS.
This does not sign an app or bypass provisioning. A sideloading signer is required.
"""
from pathlib import Path, PurePosixPath
import hashlib
import json
import os
import plistlib
import shutil
import stat
import struct
import subprocess
import sys
import zipfile

ARM64 = 0x100000C
FAT = {b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf'}

def slices(data):
    if data[:4] in FAT:
        wide = data[:4] == b'\xca\xfe\xba\xbf'
        count = struct.unpack_from('>I', data, 4)[0]
        width = 32 if wide else 20
        if not 1 <= count <= 16 or 8 + count * width > len(data):
            raise ValueError('INVALID_FAT_HEADER')
        result=[]
        for i in range(count):
            fields=struct.unpack_from('>IIQQII' if wide else '>IIIII',data,8+i*width)
            cpu,sub,offset,length=fields[:4]
            if offset < 8+count*width or length < 32 or offset+length>len(data):
                raise ValueError('INVALID_FAT_SLICE_BOUNDS')
            result.append((cpu,data[offset:offset+length]))
        return result
    return [(None,data)]

def audit_macho(data):
    result=[]
    for advertised,binary in slices(data):
        if len(binary)<32 or binary[:4]!=b'\xcf\xfa\xed\xfe':
            raise ValueError('NOT_DEVICE_MACHO64')
        header=struct.unpack_from('<8I',binary)
        if header[1]!=ARM64 or (advertised is not None and advertised!=header[1]):
            raise ValueError('NOT_ARM64_DEVICE_BINARY')
        count,total=header[4:6]
        if count>4096 or 32+total>len(binary): raise ValueError('INVALID_LOAD_COMMANDS')
        offset=32;platforms=[];signed=False;ios_min=False
        for _ in range(count):
            if offset+8>32+total:raise ValueError('INVALID_LOAD_COMMANDS')
            command,size=struct.unpack_from('<II',binary,offset)
            if size<8 or offset+size>32+total:raise ValueError('INVALID_LOAD_COMMANDS')
            if command==0x32:
                if size<24:raise ValueError('INVALID_BUILD_VERSION')
                platforms.append(struct.unpack_from('<I',binary,offset+8)[0])
            if command==0x25:ios_min=True
            if command==0x1d:signed=True
            offset+=size
        if offset!=32+total:raise ValueError('INVALID_LOAD_COMMAND_LENGTH')
        if any(p!=2 for p in platforms) or (not platforms and not ios_min):
            raise ValueError('NOT_IOS_DEVICE_PLATFORM')
        result.append({'architecture':'arm64','platform':'iphoneos','signed':signed})
    return result

def executables(app):
    plists=[app/'Info.plist',*sorted((app/'Frameworks').glob('*.framework/Info.plist'))]
    for path in plists:
        info=plistlib.loads(path.read_bytes());name=info.get('CFBundleExecutable')
        if not isinstance(name,str) or '/' in name or name in ('','.','..'):
            raise ValueError('INVALID_BUNDLE_EXECUTABLE')
        executable=path.parent/name
        if not executable.is_file() or executable.is_symlink():raise ValueError('MISSING_BUNDLE_EXECUTABLE')
        yield executable

def unpack(ipa,folder):
    with zipfile.ZipFile(ipa) as archive:
        if archive.testzip() is not None:raise ValueError('CORRUPTED_IPA_ZIP')
        for member in archive.infolist():
            path=PurePosixPath(member.filename)
            if path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0]!='Payload' or stat.S_ISLNK(member.external_attr>>16):
                raise ValueError('UNSAFE_IPA_MEMBER')
            if member.file_size>256*1024*1024:raise ValueError('IPA_MEMBER_TOO_LARGE')
        archive.extractall(folder)
    apps=list((folder/'Payload').glob('*.app'))
    if len(apps)!=1:raise ValueError('EXPECTED_ONE_APP')
    return apps[0]

def normalize(app):
    if sys.platform!='darwin':raise ValueError('APPLE_TOOLS_REQUIRE_MACOS')
    changes=[]
    for binary in executables(app):
        before=audit_macho(binary.read_bytes())
        fat=binary.read_bytes()[:4] in FAT
        if fat:
            temporary=binary.with_name(binary.name+'.arm64-temp')
            subprocess.run(['xcrun','lipo',str(binary),'-thin','arm64','-output',str(temporary)],check=True)
            os.replace(temporary,binary)
        if any(row['signed'] for row in before):
            subprocess.run(['codesign','--remove-signature',str(binary)],check=True)
        binary.chmod(0o755)
        after=audit_macho(binary.read_bytes())
        if len(after)!=1 or any(row['signed'] for row in after):raise ValueError('UNSIGNED_ARM64_NORMALIZATION_FAILED')
        changes.append({'binary':str(binary.relative_to(app)),'thinned':fat,'original_signed':any(row['signed'] for row in before),'executable_mode':'0755'})
    for path in list(app.rglob('_CodeSignature')):
        if path.is_dir():shutil.rmtree(path)
    for path in list(app.rglob('embedded.mobileprovision')):path.unlink()
    return changes

def package(folder,destination):
    with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for path in sorted((folder/'Payload').rglob('*')):
            if path.is_symlink():raise ValueError('SYMLINK_IN_IPA')
            if path.is_file():archive.write(path,path.relative_to(folder).as_posix())
    with zipfile.ZipFile(destination) as archive:
        if archive.testzip() is not None:raise ValueError('CORRUPTED_OUTPUT_IPA')
    return hashlib.sha256(destination.read_bytes()).hexdigest()

if __name__=='__main__':
    if len(sys.argv)!=4:raise SystemExit('Usage: ios_package_compat.py INPUT.ipa WORK_DIR OUTPUT.ipa')
    source,folder,destination=map(Path,sys.argv[1:]);folder.mkdir(parents=True,exist_ok=False)
    app=unpack(source,folder);changes=normalize(app);digest=package(folder,destination)
    info=plistlib.loads((app/'Info.plist').read_bytes())
    report={'input_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'output_sha256':digest,'version':info['CFBundleShortVersionString'],'build':info['CFBundleVersion'],'bundle_id':info['CFBundleIdentifier'],'minimum_ios':info.get('MinimumOSVersion'),'unsigned':True,'requires_external_signing':True,'physical_install_verified':False,'binaries':changes}
    destination.with_suffix('.report.json').write_text(json.dumps(report,indent=2)+'\n')
    destination.with_name(destination.name+'.sha256').write_text(digest+'  '+destination.name+'\n')
    print(json.dumps(report))
