"""Sign a hash-pinned owned APK fixture and verify the permanent key using the runner SDK.
The fixture is never executed, uploaded or published. All passwords stay in child environment.
"""
import base64,hashlib,json,os,subprocess,tempfile
from pathlib import Path
from configure_android_release_signing import signing_values,NAMES
from check_android_signing_certificate import verify
values=signing_values(os.environ)
with tempfile.TemporaryDirectory(prefix='najd-signing-smoke-') as folder:
    folder=Path(folder);source=folder/'Najd-TV-Android-Mobile-ARM64.apk'
    subprocess.run(['gh','release','download','v2.0.4','--repo','th-505/NajdTV','--pattern',source.name,'--dir',str(folder)],check=True,capture_output=True,timeout=120)
    if hashlib.sha256(source.read_bytes()).hexdigest()!='22584e1805f752ab0f36a419640cd986036f45303a4aa62f3189f46b5c80353a':raise SystemExit('SIGNING_FIXTURE_CHECKSUM_MISMATCH')
    key=folder/'release.jks';key.write_bytes(base64.b64decode(values[NAMES[0]],validate=True));key.chmod(0o600)
    sdk=subprocess.check_output(['bash','-c','find "$ANDROID_HOME/build-tools" -type f -name apksigner | sort -V | tail -1'],text=True).strip()
    if not sdk:raise SystemExit('ANDROID_SDK_SIGNER_MISSING')
    env=os.environ.copy();env['NAJD_SMOKE_STORE_PASS']=values[NAMES[1]];env['NAJD_SMOKE_KEY_PASS']=values[NAMES[3]]
    signed=folder/'fixture-signed.apk'
    subprocess.run([sdk,'sign','--ks',str(key),'--ks-key-alias',values[NAMES[2]],'--ks-pass','env:NAJD_SMOKE_STORE_PASS','--key-pass','env:NAJD_SMOKE_KEY_PASS','--out',str(signed),str(source)],env=env,capture_output=True,check=True,timeout=120)
    output=subprocess.run([sdk,'verify','--print-certs',str(signed)],capture_output=True,text=True,check=True,timeout=60).stdout
    pin=Path('scripts/android-release-certificate.sha256').read_text().strip();verify(output,pin)
    print(json.dumps({'sdk_build_tools':Path(sdk).parent.name,'verified':True,'permanent_certificate_sha256':pin,'public_record_labels':[line.split(':',1)[0] for line in output.splitlines() if line.startswith('Signer') and 'certificate SHA-256 digest:' in line],'fixture_published':False}))
