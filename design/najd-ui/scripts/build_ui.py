from pathlib import Path
import json,re,shutil,html,subprocess
ROOT=Path(__file__).resolve().parents[1];UI=ROOT/'ui';SH=UI/'shared';OUT=UI/'screens'
selection=json.loads((ROOT/'design/latest/selection.json').read_text());batch=json.loads((ROOT/'planning/batch-01-50.json').read_text())
esc=html.escape
# Reuse individual content image URLs from source HTML, never full-screen screenshots.
source=(ROOT/'design/latest/watchlist/dark/code.html').read_text()+'\n'+'\n'.join((ROOT/'design/latest'/r['path']/'code.html').read_text() for r in selection)
images=list(dict.fromkeys(re.findall(r'<img[^>]+src="([^"]+)"',source)))
images=[html.unescape(x) for x in images if x.startswith('https://')]
(UI/'content-images.json').write_text(json.dumps(images,indent=2))
def img(i):return images[i%len(images)]
def go(slug,theme='dark'):
 return f'../{slug}-{"dark" if slug=="player" else theme}/index.html'
def btn(label,slug=None,theme='dark',secondary=False,action=None):
 cls='button'+(' secondary' if secondary else '')
 if slug:return f'<a class="{cls}" href="{go(slug,theme)}">{label}</a>'
 return f'<button class="{cls}" type="button" {action or "data-toast=\"هذه معاينة للواجهة؛ الربط بالخادم لاحقًا\""}>{label}</button>'
def nav(theme):
 return '<nav class="nav" aria-label="التنقل الرئيسي">'+''.join(f'<a href="{go(s,theme)}">{icon}<br>{label}</a>' for s,label,icon in [('home','الرئيسية','⌂'),('search','البحث','⌕'),('watchlist','قائمتي','♡'),('settings','الإعدادات','⚙')])+'</nav>'
def header(theme,title='نجد تي في'):
 return f'<header class="top"><a class="icon" href="{go("home",theme)}" aria-label="الرجوع للرئيسية">→</a><a class="brand" href="{go("home",theme)}">{title}</a><a class="icon" href="{go("settings",theme)}" aria-label="الإعدادات">⚙</a></header>'
def posters(theme,n=4,edit=False):
 names=['أصداء طويق','صقر الجزيرة','سيف السديم','سراب المدينة','خيول الريح','رحلة نحو النجوم']
 cards=[]
 for i in range(n):
  content=f'<img src="{esc(img(i))}" alt="بوستر {names[i%6]}"/><div class="meta"><h3>{names[i%6]}</h3><p class="small">2024 · {"مسلسل" if i%2==0 else "فيلم"} <span>★ 8.7</span></p></div>'
  if edit:cards.append(f'<article class="card poster"><label class="select"><input type="checkbox" aria-label="تحديد {names[i%6]}"/></label>{content}</article>')
  else:cards.append(f'<a class="card poster" href="{go("series" if i%2==0 else "movie",theme)}">{content}</a>')
 return '<div class="grid">'+''.join(cards)+'</div>'
def options(labels,checked=0):
 return '<div class="stack">'+''.join(f'<label class="option"><input type="radio" name="choice" {"checked" if i==checked else ""}/><span>{a}</span>{"<span class=\"badge\">المحدد</span>" if i==checked else ""}</label>' for i,a in enumerate(labels))+'</div>'
def video():return f'<div class="video"><img src="{esc(img(4))}" alt="مشهد من العمل"/><div class="overlay"><span class="spinner" role="status" aria-label="جارٍ التحميل"></span></div></div>'
def render(r):
 s,t=r['slug'],r['theme'];title=r['title'];tv=r['platform']=='تلفزيون';body='';extra=''
 if s in ['confirm-cancel-download','confirm-delete-download']:
  cancel=s=='confirm-cancel-download'; body='<h1>التحميلات</h1>'+video()+'<div class="card"><h2>أصداء طويق</h2><p>الموسم 1 · الحلقة 4</p><div class="progress"><span></span></div></div>'
  msg='سيتم إيقاف تنزيل هذا العمل وحذف الملفات المؤقتة التي تم تحميلها حتى الآن.' if cancel else 'سيتم حذف هذا العمل من هذا الجهاز فقط. لن تتم إزالته من قائمتي.'
  extra=f'<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><span class="eyebrow">إدارة التحميلات</span><h1 id="dialog-title">{title}؟</h1><p>{msg}</p><div class="stack">{btn("إلغاء التحميل" if cancel else "حذف من الجهاز",action="data-toast=\"معاينة فقط — لم يتم حذف أي ملف\"")}{btn("متابعة التحميل" if cancel else "إلغاء","downloads-active" if cancel else "downloads-completed",t,True)}</div></section></div>'
 elif s in ['offline','no-source','no-results','storage-full']:
  data={'offline':('⌁','لا يوجد اتصال بالإنترنت','تحقق من اتصالك بالشبكة، أو شاهد الأعمال المحفوظة على جهازك.','إعادة المحاولة','التحميلات','downloads-completed'), 'no-source':('▷','لا يتوفر مصدر تشغيل حاليًا','لم نتمكن من تجهيز رابط لهذا العمل. يمكنك إعادة الفحص أو العودة للتفاصيل.','إعادة الفحص','الرجوع لتفاصيل العمل','series'),'no-results':('⌕','لا توجد نتائج مطابقة','جرّب كلمات بحث أخرى أو امسح الفلاتر لتوسيع النتائج.','مسح الفلاتر','تعديل البحث','search'),'storage-full':('▤','المساحة المتاحة لا تكفي','يحتاج هذا التحميل إلى 1.8 جيجابايت. المساحة المتاحة حاليًا 740 ميجابايت.','إدارة التحميلات','إلغاء','series')}
  symbol,h,p,primary,secondary,target=data[s]
  if s=='no-results':body='<label for="query" class="small">البحث</label><input id="query" class="search" value="رحلة الصمان"/><div class="chips"><button class="chip active">وثائقي</button><button class="chip active">2024</button></div>'
  if s=='no-source':body=video()
  body+=f'<section class="center" style="padding-top:{40 if s in ["no-results","no-source"] else 100}px"><div class="state-symbol">{symbol}</div><h1>{h}</h1><p>{p}</p>'
  body+=btn(primary,'downloads-completed' if s=='storage-full' else None,t,action='data-clear-filters' if s=='no-results' else None)+btn(secondary,target,t,True)+'</section>'
 elif s.endswith('-loading'):
  if s=='search-loading':body='<input class="search" aria-label="بحث" value="أصداء طويق"/>'
  body+='<span class="eyebrow" role="status">جارٍ تحميل المحتوى</span><div class="skeleton hero"></div><div class="skeleton line"></div><div class="skeleton" style="width:50%"></div><div class="grid">'+''.join('<div><div class="skeleton poster-block"></div><div class="skeleton line"></div></div>' for _ in range(4))+'</div>'
 elif s in ['player-buffering','player-error','link-refresh']:
  body='<span class="eyebrow">فرسان الظلال · الموسم 1 · الحلقة 3</span><h1>'+{'player-buffering':'جارٍ تحميل الفيديو','player-error':'تعذر تشغيل الفيديو','link-refresh':'جارٍ تجديد رابط التشغيل'}[s]+'</h1>'+video()
  body+='<div class="card"><div class="row"><strong>المصدر المختار</strong><span class="badge">المصدر 1</span></div><p>موضع المشاهدة المحفوظ: 24:15</p><div class="progress"><span></span></div></div>'
  body+='<p>'+{'player-buffering':'ننتظر وصول بيانات الفيديو. يمكنك إيقاف المحاولة واختيار مصدر آخر.','player-error':'لم يكتمل التشغيل. حاول مجددًا أو اختر مصدرًا متاحًا.','link-refresh':'نعيد تجهيز رابط من نفس المصدر، ثم نستأنف من موضعك المحفوظ عند نجاح التشغيل.'}[s]+'</p>'+btn('اختيار مصدر','sources',t)+btn('العودة للعمل','series',t,True)
 elif s in ['quality-picker','audio-picker','subtitle-picker','download-quality']:
  labels={'quality-picker':['تلقائي — حسب الاتصال','1080p · Full HD','720p · HD','480p · SD'],'audio-picker':['العربية — الصوت الأصلي','الإنجليزية — ستيريو'],'subtitle-picker':['إيقاف الترجمة','العربية','الإنجليزية — CC'],'download-quality':['1080p — الحجم المقدر 1.8 جيجابايت','720p — الحجم المقدر 980 ميجابايت','480p — الحجم المقدر 650 ميجابايت']}[s]
  body=f'<span class="eyebrow">فرسان الظلال · الحلقة 3</span><h1>{title}</h1><p>الخيارات المعروضة من بيانات هذا المصدر.</p>'+options(labels,1 if s=='subtitle-picker' else 0)+'<div style="height:24px"></div>'+btn('بدء التحميل' if s=='download-quality' else 'تطبيق', 'downloads-active' if s=='download-quality' else 'player',t)+btn('إلغاء','series' if s=='download-quality' else 'player',t,True)
 elif s=='next-episode':
  body='<span class="eyebrow">انتهت الحلقة 3</span><h1>مستعد للحلقة التالية؟</h1>'+video()+'<div class="card"><h2>الحلقة 4: بوابة الظلال</h2><p>الموسم 1 · 48 دقيقة</p><p>يصل الفريق إلى بوابة قديمة تكشف مسارًا جديدًا في الرحلة.</p><span class="badge">التشغيل خلال 15 ثانية — معاينة</span></div>'+btn('تشغيل الآن','player',t)+btn('إلغاء التشغيل التلقائي','series',t,True)
 elif s=='provider-picker':
  body='<span class="eyebrow">استكشاف متقدم</span><h1>اختر مزود المحتوى</h1><p>نتائج البحث والأعمال ستبقى مرتبطة بالمزود الذي تختاره.</p>'
  for i,name in enumerate(['قصة عشق','أكوام','لاروزا','Anime4up']):body+=f'<a class="card row" href="{go("provider-catalog",t)}"><div><h2>{name}</h2><p class="small">بحث · تفاصيل · حلقات</p></div><span class="badge">لم يُختبر الآن</span><span>←</span></a>'
  body+='<div class="notice">ظهور اسم المزود لا يعني تأكيد توفر رابط تشغيل.</div>'
 elif s in ['provider-catalog','provider-search']:
  body=f'<span class="eyebrow">المزود المحدد: قصة عشق</span><h1>{"البحث داخل المزود" if s=="provider-search" else "مكتبة المزود"}</h1><form action="{go("provider-search",t)}"><label class="small" for="provider-query">ابحث في قصة عشق</label><input id="provider-query" name="q" class="search" placeholder="اسم العمل" value="{"أصداء" if s=="provider-search" else ""}"/><button class="button" style="margin-top:12px">بحث في هذا المزود</button></form><div class="chips"><button class="chip active">الكل</button><button class="chip">مسلسلات</button><button class="chip">أفلام</button></div>'+posters(t)+f'<p class="notice">الموسم والحلقة ومرجع العمل محفوظة مع قصة عشق. <a href="{go("provider-picker",t)}">تغيير المزود</a></p>'
 elif s=='watchlist-edit':
  body='<div class="row"><h1>تعديل قائمتي</h1><a href="'+go('watchlist',t)+'">تم</a></div><p>حدد الأعمال التي تريد إزالتها من القائمة.</p><div class="toolbar"><button class="chip" data-select-all>تحديد الكل</button><span>المحدد: <strong data-selection-count>0</strong></span></div>'+posters(t,6,True)+'<div class="card">'+btn('إزالة المحدد',action='data-remove-selection')+'<p class="small">لن تُحذف التحميلات أو تقدم المشاهدة.</p></div>'
 elif tv:
  if s=='tv-home':body=f'<section class="hero"><img src="{esc(img(4))}" alt="خلفية العمل"/><div><span class="eyebrow">مختارات نجد تي في</span><h1>فرسان الظلال</h1><p>رحلة تكشف أسرارًا جديدة خلف أسوار المدينة.</p><a class="button focused" href="{go("tv-series",t)}">▶︎ عرض العمل</a></div></section><h2>متابعة المشاهدة</h2>'+posters(t,5)
  elif s=='tv-search':
   letters='أ ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي'.split()
   body='<h1>البحث والاستكشاف</h1><div class="search-layout"><section><input class="search" aria-label="بحث" placeholder="ابحث عن عمل"/><p class="small">استخدم الريموت لاختيار الحروف</p><div class="keyboard">'+''.join(f'<button data-key="{c}" class="{"focused" if i==0 else ""}">{c}</button>' for i,c in enumerate(letters))+'</div><div class="toolbar"><button class="button secondary" data-backspace>حذف حرف</button><button class="button secondary" data-clear-search>مسح البحث</button></div></section><section><h2>أعمال مقترحة</h2>'+posters(t,3)+'</section></div>'
  elif s=='tv-series':
   body=f'<section class="hero" style="height:360px"><img src="{esc(img(4))}" alt="غلاف فرسان الظلال"/><div><h1>فرسان الظلال</h1><p>2024 · 3 مواسم · دراما ومغامرة</p><a class="button focused" href="{go("tv-player",t)}">▶︎ متابعة الحلقة 3</a></div></section><div class="chips"><button class="chip active">الموسم 1</button><button class="chip">الموسم 2</button><button class="chip">الموسم 3</button></div>'
   for i,name in enumerate(['فجر العاصفة','عهد الدماء','خيوط المؤامرة']):body+=f'<a class="episode" href="{go("tv-player",t)}"><img src="{esc(img(i+3))}" alt="صورة الحلقة {i+1}"/><div><h3>الحلقة {i+1}: {name}</h3><p>48 دقيقة · الموسم الأول</p><div class="progress"><span style="width:{45 if i==2 else 100}%"></span></div></div><span>▶︎</span></a>'
  elif s=='tv-player':
   body=f'<div class="video"><img src="{esc(img(4))}" alt="مشهد فرسان الظلال"/><div class="overlay"><h1>فرسان الظلال</h1><p style="color:white">الموسم 1 · الحلقة 3</p><button class="button focused" data-play>Ⅱ إيقاف مؤقت</button></div><div class="player-bottom"><div class="row" dir="ltr"><span>24:15</span><span>52:30</span></div><div class="progress"><span></span></div><div class="controls"><a class="button" href="{go("tv-sources",t)}">مصادر التشغيل</a><a class="button secondary" href="{go("quality-picker",t)}">الجودة</a><a class="button secondary" href="{go("subtitle-picker",t)}">الصوت والترجمة</a><a class="button secondary" href="{go("tv-series",t)}">الحلقات</a></div></div></div>'
  else:
   body='<section class="source-panel"><h1>مصادر التشغيل</h1><p>فرسان الظلال · الموسم 1 · الحلقة 3</p><div class="stack">'
   for i,status in enumerate(['قيد التشغيل','اجتاز فحص الوسائط','جارٍ الفحص','تعذر التشغيل']):body+=f'<div class="option {"focused" if i==1 else ""}" tabindex="0"><span><h2>المصدر {i+1}</h2><p class="small">1080p · العربية الأصلية</p></span><span class="badge">{status}</span>'+ (f'<a class="button" href="{go("tv-player",t)}">اختيار المصدر</a>' if i==1 else btn('إعادة المحاولة',action='data-toast="جارٍ الفحص — معاينة"') if i==3 else '')+'</div>'
   body+='</div><p class="notice">يتغير المصدر فقط بعد اختيارك. صلاحية الرابط منفصلة عن بدء التشغيل الفعلي.</p></section>'
 else:raise ValueError(s)
 if tv:
  links=[('tv-home','الرئيسية'),('tv-search','البحث'),('watchlist','قائمتي'),('settings','الإعدادات')]
  shell='<div class="screen tv"><aside class="sidebar"><strong class="brand">نجد تي في</strong>'+''.join(f'<a href="{go(sl,t)}" class="{"active" if sl==s else ""}">{label}</a>' for sl,label in links)+'</aside><main>'+body+'</main></div>'
 else:shell='<div class="screen">'+header(t)+'<main>'+body+'</main>'+extra+nav(t)+'</div>'
 return f'<!doctype html><html lang="ar" dir="rtl" class="{t}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title)} — نجد تي في</title><link rel="stylesheet" href="../../shared/ui.css"><script src="../../shared/app.js" defer></script></head><body>{shell}</body></html>'
manifest=[]
for i,r in enumerate(selection,1):
 slug,theme=(r['path'].split('/')+[None])[:2];theme='dark' if theme=='landscape' else theme
 name=f'{slug}-{theme}';dest=OUT/name;dest.mkdir(parents=True,exist_ok=True)
 source=ROOT/'design/latest'/r['path']/'code.html';text=source.read_text()
 # Keep source design intact while adding local typography at final cascade priority.
 text=text.replace("document.getElementById('clear-all-btn').addEventListener", "document.getElementById('clear-all-btn')?.addEventListener")
 text=re.sub(r'<link[^>]+href="https://fonts\.googleapis\.com/css[^>]+>', '', text)
 text=text.replace('</head>','<link rel="stylesheet" href="../../shared/icons.css"><link rel="stylesheet" href="../../shared/thmanyah.css"><script src="../../shared/baseline.js" defer></script></head>')
 (dest/'index.html').write_text(text)
 manifest.append({'id':f'NJD-{i:03}','title':r['title'],'slug':slug,'theme':theme,'platform':'مشغل' if slug=='player' else 'جوال','path':f'screens/{name}/index.html','origin':'baseline','source':r['path']})
for r in batch:
 dest=OUT/f"{r['slug']}-{r['theme']}";dest.mkdir(parents=True,exist_ok=True);(dest/'index.html').write_text(render(r))
 manifest.append({**r,'path':f"screens/{r['slug']}-{r['theme']}/index.html",'origin':'new','status':'implemented-ui'})
assert len(manifest)==81 and len({r['path'] for r in manifest})==81
(UI/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
# Typography is shared and maintained in ui/shared/thmanyah.css.

cards=''.join(f'<a class="catalog-card" data-theme="{r["theme"]}" data-platform="{r["platform"]}" href="{r["path"]}"><span>{r["id"]} · {r["platform"]}</span><h2>{esc(r["title"])}</h2><p>{"داكن" if r["theme"]=="dark" else "فاتح"} · {"أساس" if r["origin"]=="baseline" else "جديد"}</p><b>فتح الواجهة ←</b></a>' for r in manifest)
(UI/'index.html').write_text('''<!doctype html><html dir="rtl" lang="ar"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>نجد تي في — 81 واجهة</title><link rel="stylesheet" href="shared/ui.css"><style>body{padding:40px;max-width:1600px;margin:auto}.catalog{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}.catalog-card{padding:24px;border:1px solid var(--border);background:var(--surface);border-radius:20px}.catalog-card span{font-size:12px;color:var(--muted)}.catalog-card h2{margin-top:14px}.catalog-card b{color:var(--primary)}.intro{max-width:800px;margin-bottom:32px}#filter{max-width:450px;margin:20px 0}</style><div class="intro"><span class="eyebrow">NAJD TV · INTERFACE LIBRARY</span><h1>نجد تي في، بكل حالاته.</h1><p>81 واجهة وحالة: 31 مرجعًا أساسيًا و50 إضافة للجوال والتلفزيون. خط ثمانية، مظهران، وهوية واحدة.</p><p class="notice">هذه مكتبة واجهات ومعاينات تفاعلية. خدمات المشاهدة والتحميل والبحث الحي لم تُربط بالخادم بعد.</p><input id="filter" class="search" aria-label="تصفية الشاشات" placeholder="ابحث باسم الواجهة أو رقمها…"></div><p id="count">81 واجهة</p><main class="catalog">'''+cards+'''</main><script>document.querySelector('#filter').addEventListener('input',e=>{let n=0;document.querySelectorAll('.catalog-card').forEach(c=>{const show=c.textContent.includes(e.target.value);c.hidden=!show;if(show)n++});document.querySelector('#count').textContent=n+' واجهة'})</script></html>''')
print('Built 81 screens:',len(selection),'baseline +',len(batch),'new')
