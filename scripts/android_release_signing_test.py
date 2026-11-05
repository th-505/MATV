import base64
import json
from pathlib import Path
import tempfile
from configure_android_release_signing import configure, NAMES
with tempfile.TemporaryDirectory() as directory:
    root=Path(directory);file=root/'android/app/build.gradle.kts';file.parent.mkdir(parents=True)
    original='android { buildTypes { release { signingConfig = signingConfigs.getByName("debug") } } }'
    file.write_text(original)
    try: configure(root,{})
    except ValueError as e: assert 'PERSISTENT_ANDROID_SIGNING_SECRETS_REQUIRED' in str(e)
    else: raise AssertionError('Disposable signing fallback allowed')
    assert file.read_text()==original
    env=dict(zip(NAMES,[base64.b64encode(b'fixture-not-a-real-key'*4).decode(),'fixture-store-secret','fixture-alias','fixture-key-secret']))
    env['RUNNER_TEMP']=directory
    key=configure(root,env);result=file.read_text()
    assert 'getByName("debug")' not in result and 'najdRelease' in result
    assert 'fixture-store-secret' not in result and 'fixture-key-secret' not in result
    assert key.read_bytes()==b'fixture-not-a-real-key'*4
    assert key.stat().st_mode&0o777==0o600
    file.write_text(original)
    key=configure(root,{'NAJD_ANDROID_SIGNING_BUNDLE':json.dumps({name:env[name] for name in NAMES}), 'RUNNER_TEMP':directory})
    assert key.read_bytes()==b'fixture-not-a-real-key'*4
    assert 'fixture-store-secret' not in file.read_text()
    assert 'NAJD_ANDROID_SIGNING_BUNDLE' in file.read_text()
print('Android signing: missing-key fail closed, persistent configuration, no plaintext passwords and private file permissions passed.')

from check_android_signing_certificate import verify
verify('Signer #1 certificate SHA-256 digest: '+'a'*64, 'a'*64)
try:verify('Signer #1 certificate SHA-256 digest: '+'b'*64, 'a'*64)
except ValueError as e:assert 'IDENTITY_CHANGED' in str(e)
else:raise AssertionError('Unexpected signing key was accepted')
print('Android release signing identity mismatch is rejected.')
