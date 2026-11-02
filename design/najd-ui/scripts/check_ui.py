from pathlib import Path
import json,re
from urllib.parse import unquote,urlparse
ROOT=Path(__file__).resolve().parents[1];m=json.loads((ROOT/'ui/manifest.json').read_text());errors=[]
assert len(m)==81 and len({r['id'] for r in m})==81
assert len([r for r in m if r['origin']=='baseline'])==31
for r in m:
 p=ROOT/'ui'/r['path'];s=p.read_text()
 if 'thmanyah.css' not in s and 'ui.css' not in s:errors.append((r['id'],'missing local typography'))
 for href in re.findall(r'(?:href|src)="([^"]+)"',s):
  if href.startswith(('http:','https:','#','data:','mailto:')):continue
  target=(p.parent/unquote(urlparse(href).path)).resolve()
  if not target.exists():errors.append((r['id'],href))
assert not errors,errors
print('PASS: 81 unique screens, 31 baseline + 50 new, local routes/resources and typography references')
