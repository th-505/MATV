"""Register original private faces in the build manifest without committing font bytes."""
from pathlib import Path
import re
FAMILIES={'thmanyahsans':'ThmanyahSans','thmanyahseriftext':'ThmanyahSerifText','thmanyahserifdisplay':'ThmanyahSerifDisplay'}
WEIGHTS={'Light':300,'Regular':400,'Medium':500,'Bold':700,'Black':900}

def register(root,require_all=True,extension='otf'):
    root=Path(root);pubspec=root/'pubspec.yaml';text=pubspec.read_text()
    if extension not in ('otf','woff2'):raise ValueError('INVALID_FONT_BUILD_FORMAT')
    files=[root/'assets/najd/fonts'/f'{stem}-{face}.{extension}' for stem in FAMILIES for face in WEIGHTS]
    full=all(p.is_file() for p in files)
    if require_all and not full:raise ValueError('PRIVATE_FONT_FACES_MISSING')
    if not full:
        files=[root/'assets/najd/fonts'/f'thmanyahsans-{face}.otf' for face in ('Regular','Medium','Bold')]
        if not all(p.is_file() for p in files):raise ValueError('PRIVATE_FONT_FACES_MISSING')
    # Replace only our generated family blocks, retaining fallback/user declarations.
    text=re.sub(r'    - family: Thmanyah(?:Sans|SerifText|SerifDisplay)\n(?:      [^\n]*\n|        [^\n]*\n|          [^\n]*\n)*','',text)
    marker='  fonts:\n'
    if len(re.findall(r'^  fonts:$',text,re.M))!=1:raise ValueError('FONT_MANIFEST_TEMPLATE_CHANGED')
    block=''
    for stem,family in FAMILIES.items():
        faces=[face for face in WEIGHTS if root/'assets/najd/fonts'/f'{stem}-{face}.{extension}' in files]
        if not faces:continue
        block+=f'    - family: {family}\n      fonts:\n'
        for face in faces:block+=f'        - asset: assets/najd/fonts/{stem}-{face}.{extension}\n          weight: {WEIGHTS[face]}\n'
    pubspec.write_text(text.replace(marker,marker+block,1))
    return files

if __name__=='__main__':
    import sys
    register(sys.argv[1] if len(sys.argv)>1 else 'flutter_app')
    print('Registered three original Thmanyah families and fifteen weighted faces for this build.')
