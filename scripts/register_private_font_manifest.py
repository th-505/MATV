"""Register original private font faces in the local build manifest, never source-control font bytes."""
from pathlib import Path

def register(root):
    root=Path(root);pubspec=root/'pubspec.yaml';text=pubspec.read_text()
    files=[root/'assets/najd/fonts'/f'thmanyahsans-{name}.otf' for name in ['Regular','Medium','Bold']]
    if not all(p.is_file() for p in files):raise ValueError('PRIVATE_FONT_FACES_MISSING')
    if '    - family: ThmanyahSans\n' not in text:
        block='    - family: ThmanyahSans\n      fonts:\n'
        for name,weight in [('Regular',400),('Medium',500),('Bold',700)]:
            block+=f'        - asset: assets/najd/fonts/thmanyahsans-{name}.otf\n          weight: {weight}\n'
        marker='  fonts:\n'
        if text.count(marker)!=1:raise ValueError('FONT_MANIFEST_TEMPLATE_CHANGED')
        text=text.replace(marker,marker+block,1);pubspec.write_text(text)
    return files

if __name__=='__main__':
    import sys
    register(sys.argv[1] if len(sys.argv)>1 else 'flutter_app')
    print('Registered original Thmanyah regular/medium/bold faces for this private build.')
