"""Prepare unmodified user-supplied Thmanyah build inputs; font bytes stay outside source control."""
import argparse
import hashlib
import json
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--source',type=Path,required=True)
p.add_argument('--platform',choices=('native','web'),default='native')
a=p.parse_args();root=Path(__file__).resolve().parents[1]
contract=json.loads((root/'shared/thmanyah-font-faces.json').read_text())
ext='otf' if a.platform=='native' else 'woff2';inputs={}
for row in contract['files']:
    if row['format']!=ext:continue
    family=row['name'].split('-')[0];source=a.source/'thmanyah typeface'/family/ext/row['name']
    if not source.is_file():raise SystemExit('Missing original font: '+row['name'])
    data=source.read_bytes()
    if hashlib.sha256(data).hexdigest()!=row['sha256']:raise SystemExit('Original font checksum mismatch: '+row['name'])
    inputs[row['name']]=data
license=(a.source/'LICENSE.pdf').read_bytes()
if hashlib.sha256(license).hexdigest()!='07bbb2321bd2b944333c25f4d55140ca22625666132394d7399a365bd8b79a10':raise SystemExit('Original license checksum mismatch')
# Validate all fifteen faces before replacing any previous input.
destination=root/'flutter_app/assets/najd/fonts';destination.mkdir(parents=True,exist_ok=True)
for old in destination.glob('thmanyah*.*'):
    if old.suffix in ('.otf','.woff2'):old.unlink()
for name,data in inputs.items():(destination/name).write_bytes(data)
(destination/'LICENSE.pdf').write_bytes(license)
from register_private_font_manifest import register
register(root/'flutter_app',extension=ext)
print(f'Prepared three original families, fifteen {ext} faces and unchanged license for {a.platform}; no font bytes enter Git.')
