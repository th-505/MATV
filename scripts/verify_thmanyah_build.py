"""Verify fifteen original weighted faces in compiled Flutter directories or archives."""
from pathlib import Path
import hashlib,json,sys

def verify_content(manifest,read,format):
    contract=json.loads((Path(__file__).resolve().parents[1]/'shared/thmanyah-font-faces.json').read_text())
    families={row['family']:row['fonts'] for row in manifest if row.get('family') in ['ThmanyahSans','ThmanyahSerifText','ThmanyahSerifDisplay']}
    if len(families)!=3:raise ValueError('THMANYAH_THREE_FAMILIES_REQUIRED')
    declared={face['asset']:face.get('weight',400) for faces in families.values() for face in faces}
    if len(declared)!=15:raise ValueError('THMANYAH_FIFTEEN_FACES_REQUIRED')
    for row in contract['files']:
        if row['format']!=format:continue
        relative='assets/najd/fonts/'+row['name']
        if declared.get(relative)!=row['weight']:raise ValueError('THMANYAH_WEIGHT_MANIFEST_MISMATCH')
        if hashlib.sha256(read(relative)).hexdigest()!=row['sha256']:raise ValueError('THMANYAH_ORIGINAL_BYTES_MISMATCH')
    if hashlib.sha256(read('assets/najd/fonts/LICENSE.pdf')).hexdigest()!='07bbb2321bd2b944333c25f4d55140ca22625666132394d7399a365bd8b79a10':raise ValueError('THMANYAH_ORIGINAL_LICENSE_REQUIRED')
    return {'families':3,'faces':15,'format':format,'original_bytes_verified':True,'weights':[300,400,500,700,900]}

def verify(root,format):
    root=Path(root)
    return verify_content(json.loads((root/'FontManifest.json').read_text()),lambda relative:(root/relative).read_bytes(),format)

def verify_zip(archive,prefix,format):
    return verify_content(json.loads(archive.read(prefix+'FontManifest.json')),lambda relative:archive.read(prefix+relative),format)

if __name__=='__main__':print(json.dumps(verify(sys.argv[1],sys.argv[2])))
