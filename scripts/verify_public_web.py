"""Check the actual Flutter Pages output before uploading it for deployment."""
from pathlib import Path
import json
import sys

root = Path(sys.argv[1]).resolve()
index = (root / 'index.html').read_text()
assert '<base href="/NajdTV/">' in index, 'Pages assets must resolve under /NajdTV/'
for name in ('flutter_bootstrap.js', 'main.dart.js', 'assets/AssetManifest.bin'):
    assert (root / name).is_file(), f'Missing actual application output: {name}'
manifest = json.loads((root / 'source-manifest.json').read_text())
assert manifest, 'Missing immutable source identity'
approved_fonts=json.loads((Path(__file__).resolve().parents[1]/'shared/thmanyah-font-faces.json').read_text())
allowed_faces={row['name'] for row in approved_fonts['files'] if row['format']=='woff2'}
font_files=[]
for path in root.rglob('*'):
    if not path.is_file():
        continue
    if path.suffix.lower() in ('.otf','.ttf','.woff','.woff2') and 'thmanyah' in path.name.lower():
        assert path.suffix.lower()=='.woff2' and path.name in allowed_faces, 'Only approved original Web faces may enter built output'
        font_files.append(path)

    assert path.name not in ('.env', 'service-account.json'), 'Unexpected private input'
if font_files:
    from verify_thmanyah_build import verify
    assert len(font_files)==15, 'Exactly fifteen Web faces are required'
    verify(root/'assets','woff2')
print('Verified Flutter application, /NajdTV/ asset base, source manifest and private-font boundary.')
