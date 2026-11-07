"""Publish a verified Flutter bundle through the existing main:/ Pages source.
Preserves Jekyll exclusions and repository inputs; never enable .nojekyll here.
"""
from pathlib import Path
import json
import shutil
import subprocess
import sys

source = Path(sys.argv[1]).resolve()
repo = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(repo / 'scripts/verify_public_web.py'), str(source)], check=True)
assert 'internal_web' in (repo / '_config.yml').read_text(), 'Keep authenticated server bundle excluded'
assert not (repo / '.nojekyll').exists(), 'Do not disable repository exclusions'
allowed = {'assets', 'canvaskit', 'icons', 'index.html', 'favicon.png', 'manifest.json',
           'flutter.js', 'flutter_bootstrap.js', 'flutter_service_worker.js', 'main.dart.js',
           'version.json', 'source-manifest.json', 'najd-video.js', 'najd-update.js', 'najd-install.js'}
files = []
for path in source.rglob('*'):
    assert not path.is_symlink(), 'Symlinks cannot enter public output'
    if not path.is_file():
        continue
    rel = path.relative_to(source)
    if str(rel) in {'.nojekyll', '.last_build_id'}:
        continue
    assert rel.parts[0] in allowed, f'Unexpected public path: {rel}'
    assert rel.parts[:2] != ('assets', 'brand'), 'Do not overwrite brand source inputs'
    files.append(rel)
files.sort(key=lambda path: path.as_posix())
# Validate the whole input before mutating the checked-out repository.
for rel in files:
    target = repo / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source / rel, target)
record = '.najd-public-build-files.json'
(repo / record).write_text(json.dumps([str(p) for p in files], ensure_ascii=False, indent=2)+'\n')
subprocess.run(['git', 'add', '-f', '--', record, *map(str, files)], cwd=repo, check=True)
print(f'Staged {len(files)} verified public files; server/private inputs and Jekyll exclusions preserved.')
