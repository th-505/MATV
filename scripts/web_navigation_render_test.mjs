import {chromium} from 'playwright-core';
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
const root=path.resolve('flutter_app/build/web');const base=fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<base href="([^"]+)"/)[1];const apiBase=(process.env.NAJD_TEST_API_BASE||'https://najdtv.onrender.com').replace(/\/+$/,'');const outputDir=process.env.NAJD_FONT_OUTPUT||path.resolve('artifacts/font-render');const m={'.js':'application/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.woff2':'font/woff2','.png':'image/png'};
const server=http.createServer((req,res)=>{let route=new URL(req.url,'http://localhost').pathname;if(route.startsWith(base))route=route.slice(base.length);if(!route)route='index.html';const file=path.resolve(root,route);if(!file.startsWith(root+'/')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',m[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BIN||'/usr/bin/google-chrome',args:['--no-sandbox'],headless:true});const page=await browser.newPage({viewport:{width:1280,height:800},serviceWorkers:'block'});const errors=[],fonts=new Set();page.on('console',m=>{if(/font|woff|typeface/i.test(m.text()))errors.push(m.text().slice(0,250));});page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(/thmanyah.*woff2/.test(r.url())&&r.status()===200)fonts.add(new URL(r.url()).pathname.split('/').at(-1));});
await page.route('https://roqccichwszxamdpvhli.supabase.co/**',r=>r.fulfill({status:503,contentType:'application/json',body:'{"message":"isolated-font-fixture"}'}));
if(process.env.NAJD_DEBUG_NAV==='1') {
 page.on('console',m=>{if(m.text().startsWith('NAVTRACE'))console.log(m.text());});
 await page.addInitScript(()=>{
   for(const method of ['pushState','replaceState']) {
     const original=history[method];history[method]=function(...args){console.log('NAVTRACE '+method+' '+String(args[2]));return original.apply(this,args);};
   }
   addEventListener('popstate',()=>console.log('NAVTRACE popstate '+location.hash));
 });
}
const upstreamRequests=[],blockedHosts=[];
await page.route(apiBase+'/**',r=>{
 const url=new URL(r.request().url());upstreamRequests.push(url.pathname+url.search);
 const details=url.pathname.endsWith('/tmdb/details');
 const data=details?{ref:url.searchParams.get('ref'),title:'اختبار روابط العمل',overview:'بيانات اختبار محلية',type:'movie',year:2026,poster:'',seasons:[],episodes:[]}:[{id:'tmdb:movie:1',ref:'tmdb:movie:1',title:'نجد تيفي · Najd TV',poster:'',type:'movie',year:'2026'}];
 return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({status:'success',data,has_more:false})});
});
await page.route('**/*', r=>{
 const url=new URL(r.request().url());
 if(url.hostname==='127.0.0.1'||url.hostname===new URL(apiBase).hostname||url.hostname==='roqccichwszxamdpvhli.supabase.co'||(url.hostname==='www.gstatic.com'&&url.pathname.startsWith('/flutter-canvaskit/')))return r.fallback();
 if(['fonts.gstatic.com','fonts.googleapis.com'].includes(url.hostname)) return r.fallback();
 blockedHosts.push(url.hostname+url.pathname.slice(0,100));return r.abort();
});

try {
 await page.goto(`http://127.0.0.1:${server.address().port}${base}#/settings`);
 await page.waitForTimeout(7000);
 await page.locator('flt-semantics-placeholder').evaluateAll(nodes => nodes.forEach(n => n.click()));
 await page.waitForTimeout(1000);
 const text = await page.locator('body').innerText();
 if (!text.includes('خصص تجربة المشاهدة')) throw new Error('INITIAL_SETTINGS_ROUTE_NOT_RESTORED '+page.url()+' '+await page.locator('body').innerText()+' '+JSON.stringify({errors,blockedHosts}));
 await page.reload(); await page.waitForTimeout(5000);
 await page.locator('flt-semantics-placeholder').evaluateAll(nodes => nodes.forEach(n => n.click()));
 await page.waitForTimeout(500);
 if (!(await page.locator('body').innerText()).includes('خصص تجربة المشاهدة')) throw new Error('REFRESH_ROUTE_NOT_RESTORED '+page.url()+' '+await page.locator('body').innerText());
 await page.getByText('البحث', {exact:true}).click();
 await page.waitForTimeout(3000);
 fs.mkdirSync(outputDir,{recursive:true}); await page.screenshot({path:path.join(outputDir,'web-search.png')});
 if ((await page.getByText('البحث', {exact:true}).count()) !== 2 || (await page.locator('body').innerText()).includes('خصص تجربة المشاهدة')) throw new Error('HISTORY_ROUTE_NOT_APPLIED '+page.url()+' '+await page.locator('body').innerText());
 await page.goBack(); await page.waitForTimeout(1000);
 if (!(await page.locator('body').innerText()).includes('خصص تجربة المشاهدة')) throw new Error('BROWSER_BACK_NOT_RESTORED '+page.url()+' '+await page.locator('body').innerText());
 await page.goForward(); await page.waitForTimeout(1000);
 if ((await page.getByText('البحث', {exact:true}).count()) !== 2 || (await page.locator('body').innerText()).includes('خصص تجربة المشاهدة')) throw new Error('BROWSER_FORWARD_NOT_RESTORED');
 upstreamRequests.length=0;
 const titleUrl=`http://127.0.0.1:${server.address().port}${base}#/title?ref=tmdb%3Amovie%3A1&type=movie`;
 await page.goto(titleUrl);await page.waitForTimeout(7000);
 await page.locator('flt-semantics-placeholder').evaluateAll(nodes=>nodes.forEach(n=>n.click()));
 await page.waitForTimeout(1000);
 await page.screenshot({path:path.join(outputDir,'web-title.png')});
 if(!(await page.locator('body').innerText()).includes('بيانات اختبار محلية'))throw new Error('TITLE_CONTENT_NOT_RESTORED '+page.url()+' '+await page.locator('body').innerText()+' '+JSON.stringify({errors,upstreamRequests}));
 if(upstreamRequests.some(url=>/tmdb\/(discover|trending|popular)/.test(url)))throw new Error('UNNECESSARY_HOME_FETCH_BEHIND_TITLE');
 await page.reload();await page.waitForTimeout(5000);
 if(!page.url().includes('/title?'))throw new Error('TITLE_REFRESH_LOST_ROUTE '+page.url()+' '+await page.locator('body').innerText()+' '+JSON.stringify({errors,upstreamRequests}));
 const playerUrl=`http://127.0.0.1:${server.address().port}${base}#/player?ref=tmdb%3Atv%3A123&type=series&season=2&episode=2&number=2&source=legacy%3Afixture&episode_id=s2e2`;
 await page.goto(playerUrl);await page.waitForTimeout(7000);
 if(!page.url().includes('/player?'))throw new Error('PLAYER_ROUTE_NOT_RESTORED');
 await page.reload();await page.waitForTimeout(5000);
 const restored=new URL(page.url()).hash;
 if(!restored.includes('/player?')||!restored.includes('season=2')||!restored.includes('number=2'))throw new Error('PLAYER_REFRESH_LOST_EPISODE');
 await page.goto(`http://127.0.0.1:${server.address().port}${base}#/player?ref=tmdb%3Atv%3A123&number=0`);
 await page.waitForURL('**/#/home', {timeout:5000});
 if (errors.length) throw new Error(JSON.stringify(errors));
 console.log(JSON.stringify({initial_settings:true,refresh_settings:true,history_search:true,browser_back:true,browser_forward:true,title_refresh:true,player_episode_refresh:true,unnecessary_home_fetches:0,invalid_episode_rejected:true,errors}));
}finally{await browser.close();server.close();}
