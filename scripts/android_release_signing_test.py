import base64
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
print('Android signing: missing-key fail closed, persistent configuration, no plaintext passwords and private file permissions passed.')
