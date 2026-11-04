"""Check the actual Flutter Pages output before uploading it for deployment."""
from pathlib import Path
import json
import sys

root = Path(sys.argv[1]).resolve()
index = (root / 'index.html').read_text()
assert '<base href="/MATV/">' in index, 'Pages assets must resolve under /MATV/'
for name in ('flutter_bootstrap.js', 'main.dart.js', 'assets/AssetManifest.bin'):
    assert (root / name).is_file(), f'Missing actual application output: {name}'
manifest = json.loads((root / 'source-manifest.json').read_text())
assert manifest, 'Missing immutable source identity'
for path in root.rglob('*'):
    if not path.is_file():
        continue
    assert not (path.suffix.lower() in ('.otf', '.ttf', '.woff', '.woff2')
                and 'thmanyah' in path.name.lower()), 'Private original font must not be published'
    assert path.name not in ('.env', 'service-account.json'), 'Unexpected private input'
print('Verified Flutter application, /MATV/ asset base, source manifest and private-font boundary.')
