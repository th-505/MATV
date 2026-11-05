"""Configure a persistent private Android release key. Never generate a disposable key."""
import base64
import os
import json
from pathlib import Path
import tempfile

NAMES = ('NAJD_ANDROID_KEYSTORE_BASE64', 'NAJD_ANDROID_STORE_PASSWORD', 'NAJD_ANDROID_KEY_ALIAS', 'NAJD_ANDROID_KEY_PASSWORD')

def configure(root, env):
    values = {name: env.get(name, '') for name in NAMES}
    if env.get('NAJD_ANDROID_SIGNING_BUNDLE'):
        bundle = json.loads(env['NAJD_ANDROID_SIGNING_BUNDLE'])
        if not isinstance(bundle, dict) or set(bundle) != set(NAMES):
            raise ValueError('INVALID_ANDROID_SIGNING_BUNDLE')
        values = {name: values[name] or bundle[name] for name in NAMES}
    if any(not isinstance(values[name], str) or not values[name] or any(c in values[name] for c in ('\0','\r','\n')) for name in NAMES):
        raise ValueError('PERSISTENT_ANDROID_SIGNING_SECRETS_REQUIRED: configure NAJD_ANDROID_SIGNING_BUNDLE or the four separate signing secrets; do not replace installed-user signing identities')
    payload = base64.b64decode(values[NAMES[0]], validate=True)
    if not 32 <= len(payload) <= 1024 * 1024:
        raise ValueError('INVALID_ANDROID_KEYSTORE_SIZE')
    directory = Path(tempfile.mkdtemp(prefix='najd-signing-', dir=env.get('RUNNER_TEMP')))
    directory.chmod(0o700)
    key = directory / 'release.keystore'
    key.write_bytes(payload)
    key.chmod(0o600)
    gradle = Path(root) / 'android/app/build.gradle.kts'
    source = gradle.read_text()
    old = 'signingConfig = signingConfigs.getByName("debug")'
    if source.count(old) != 1:
        raise ValueError('ANDROID_SIGNING_TEMPLATE_CHANGED')
    # Only a private temporary path enters generated Gradle; passwords remain in environment.
    key_literal = str(key).replace('\\', '\\\\').replace('"', '\\"').replace('$', '\\$')
    block = '''
    signingConfigs {
        create("najdRelease") {
            val najdSigningBundle = groovy.json.JsonSlurper().parseText(System.getenv("NAJD_ANDROID_SIGNING_BUNDLE") ?: "{}") as Map<*, *>
            storeFile = file("KEY_PATH")
            storePassword = System.getenv("NAJD_ANDROID_STORE_PASSWORD")?.takeIf { it.isNotEmpty() } ?: najdSigningBundle["NAJD_ANDROID_STORE_PASSWORD"]?.toString()
            keyAlias = System.getenv("NAJD_ANDROID_KEY_ALIAS")?.takeIf { it.isNotEmpty() } ?: najdSigningBundle["NAJD_ANDROID_KEY_ALIAS"]?.toString()
            keyPassword = System.getenv("NAJD_ANDROID_KEY_PASSWORD")?.takeIf { it.isNotEmpty() } ?: najdSigningBundle["NAJD_ANDROID_KEY_PASSWORD"]?.toString()
        }
    }
'''.replace('KEY_PATH', key_literal)
    if source.count('android {') != 1:
        raise ValueError('ANDROID_SIGNING_TEMPLATE_CHANGED')
    source = source.replace('android {', 'android {' + block, 1).replace(old, 'signingConfig = signingConfigs.getByName("najdRelease")')
    gradle.write_text(source)
    return key

if __name__ == '__main__':
    import sys
    configure(sys.argv[1] if len(sys.argv)>1 else 'flutter_app', os.environ)
    print('Persistent private Android release signing configured; no key material logged.')
