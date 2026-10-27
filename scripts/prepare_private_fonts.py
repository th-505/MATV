"""Copy user-supplied unmodified Thmanyah faces for local builds only.
These paths are gitignored. Do not upload or encode raw fonts into public source.
"""
import argparse
import shutil
from pathlib import Path
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--source', type=Path, required=True)
a = p.parse_args()
root = Path(__file__).resolve().parents[1]
for weight in ('Regular', 'Medium', 'Bold'):
    for ext, destination in [('otf', root / 'flutter_app/assets/najd/fonts'), ('woff2', root / 'assets/private-fonts')]:
        source = a.source / 'thmanyah typeface/thmanyahsans' / ext / f'thmanyahsans-{weight}.{ext}'
        if not source.is_file():
            raise SystemExit(f'Missing original font: {source.name}')
        destination.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination / source.name)
for destination in (root / 'flutter_app/assets/najd/fonts', root / 'assets/private-fonts'):
    shutil.copyfile(a.source / 'LICENSE.pdf', destination / 'LICENSE.pdf')
print('Prepared original local-only Thmanyah files. Publication remains disabled.')
