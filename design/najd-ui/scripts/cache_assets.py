from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import re,html,hashlib,urllib.request,json
ROOT=Path(__file__).resolve().parents[1];screens=list((ROOT/'ui/screens').glob('*/index.html'));cache=ROOT/'ui/shared/images';cache.mkdir(exist_ok=True)
urls=set()
for p in screens:
 s=p.read_text()
 urls.update(html.unescape(u) for u in re.findall(r'(?:src="|url\([\x27\"]?)(https://[^\s"\x27\)]+)',s) if not u.startswith('https://cdn.tailwindcss'))
def load(url):
 key=hashlib.sha256(url.encode()).hexdigest()[:20];existing=list(cache.glob(key+'.*'))
 if existing:return url,existing[0].name,None
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
  with urllib.request.urlopen(req,timeout=30) as r:
   data=r.read(12000000); mime=r.headers.get_content_type()
  if not mime.startswith('image/'):return url,None,'not image: '+mime
  ext={'image/png':'.png','image/webp':'.webp','image/svg+xml':'.svg','image/gif':'.gif'}.get(mime,'.jpg');name=key+ext;(cache/name).write_bytes(data);return url,name,None
 except Exception as e:return url,None,str(e)
with ThreadPoolExecutor(max_workers=10) as pool:results=list(pool.map(load,urls))
for p in screens:
 s=p.read_text()
 for url,name,error in results:
  if name:
   for u in [url,html.escape(url,quote=True)]:s=s.replace(u,'../../shared/images/'+name)
 p.write_text(s)
(ROOT/'planning/asset-cache.json').write_text(json.dumps([{'url':u,'file':n,'error':e} for u,n,e in results],ensure_ascii=False,indent=2))
print('cached',sum(bool(n) for _,n,_ in results),'of',len(results));print('errors',[(u,e) for u,n,e in results if e][:3])
