from pathlib import Path
import zipfile
root=Path(__file__).resolve().parents[1];out=root/'artifacts';out.mkdir(exist_ok=True)
with zipfile.ZipFile(out/'najd-tv-ui-81.zip','w',zipfile.ZIP_DEFLATED) as z:
 for folder in ['ui']:
  for p in (root/folder).rglob('*'):
   if p.is_file():z.write(p,Path('najd-tv')/p.relative_to(root))
 z.write(root/'README.md','najd-tv/README.md')
 z.write(root/'index.html','najd-tv/index.html')
print(out/'najd-tv-ui-81.zip')
