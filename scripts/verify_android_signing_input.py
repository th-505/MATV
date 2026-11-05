"""Read CI signing secrets without logging them; prove store, private-key password and pinned certificate."""
import base64,hashlib,json,os,subprocess,tempfile
from pathlib import Path
from configure_android_release_signing import NAMES
values={name:os.environ.get(name,'') for name in NAMES}
if os.environ.get('NAJD_ANDROID_SIGNING_BUNDLE'):
 bundle=json.loads(os.environ['NAJD_ANDROID_SIGNING_BUNDLE'])
 if not isinstance(bundle,dict) or set(bundle)!=set(NAMES):raise SystemExit('INVALID_SIGNING_BUNDLE')
 values={name:values[name] or bundle[name] for name in NAMES}
if any(not isinstance(v,str) or not v for v in values.values()):raise SystemExit('SIGNING_SECRET_MISSING')
with tempfile.TemporaryDirectory(prefix='najd-ci-signing-') as folder:
 key=Path(folder)/'release.jks';key.write_bytes(base64.b64decode(values[NAMES[0]],validate=True));key.chmod(0o600)
 env=os.environ.copy();env['NAJD_VERIFY_STORE_PASS']=values[NAMES[1]];env['NAJD_VERIFY_KEY_PASS']=values[NAMES[3]]
 args=['keytool','-keystore',str(key),'-alias',values[NAMES[2]],'-storepass:env','NAJD_VERIFY_STORE_PASS']
 exported=subprocess.run([*args,'-exportcert'],env=env,capture_output=True)
 if exported.returncode:raise SystemExit('SIGNING_STORE_OPEN_FAILED')
 digest=hashlib.sha256(exported.stdout).hexdigest()
 if digest!=Path('scripts/android-release-certificate.sha256').read_text().strip():raise SystemExit('SIGNING_CERTIFICATE_MISMATCH')
 private=subprocess.run([*args,'-certreq','-keypass:env','NAJD_VERIFY_KEY_PASS','-file',str(Path(folder)/'request.csr')],env=env,capture_output=True)
 if private.returncode:raise SystemExit('SIGNING_PRIVATE_KEY_PASSWORD_FAILED')
 print(json.dumps({'persistent_signing_input_valid':True,'certificate_sha256':digest,'private_key_password_valid':True}))
