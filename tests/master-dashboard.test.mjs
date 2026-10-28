import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {existsSync,mkdirSync} from 'node:fs';
import {masterDashboardHtml,masterDashboardCss,masterDashboardJs} from '../server/diagnostics/master-dashboard.mjs';
import {buildSupportReport} from '../server/diagnostics/support-report.mjs';

const chrome=[process.env.CHROME_PATH,'/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].find(p=>p&&existsSync(p));
const sample=()=>buildSupportReport({server:{version:'1.1.7',commit:'a'.repeat(40),node:'v24.22.1',openssl:'3.0.18'},harvest:{configured:true,worker:{active:1,concurrency:2,polling:false},recent_limit:100,jobs:[{job_key:'private-key',content_ref:'source:3cktv:'+'b'.repeat(24),provider:'3cktv',stage:'episode',status:'failed',error_code:'SOURCE_REFERENCE_MISSING',attempts:1}],works:[{ref:'source:3cktv:'+'b'.repeat(24),title:'وادي الذئاب — نسخة الموقع المدبلجة',type:'series',state:'partial',episode_count:77}],sources:[{work_ref:'source:3cktv:'+'b'.repeat(24),provider:'3cktv',state:'partial',progress:{catalog_decision:{decision:'partial',edition:'dubbed',index:{observed_references:77,distinct_episodes:77,seasons:[{season:5,distinct_episodes:77,first:1,last:78,gap_ranges:[{from:36,to:36}]}]}}}}],events:[],providers:[],totals:{job_stage:[{stage:'episode',status:'queued',count:12},{stage:'episode',status:'running',count:2},{stage:'episode',status:'ready',count:133},{stage:'provider',status:'failed',count:36}],favorites:{rows:12,distinct_works:12,with_work_job:5,missing_work_job:7},favorite_types:[],work_state:{partial:1},sources:{total:1,partial:1}}},traces:[{id:'test-trace',provider:'3cktv',platform:'tv',client_version:'1.1.6',client_build:106,work_ref:'source:3cktv:'+'b'.repeat(24),phase:'playback',state:'error',reason:'NATIVE_PLAYBACK_FAILED',events:[{stage:'server_received',at_ms:0},{stage:'upstream_sent',at_ms:10},{stage:'playback_failed',phase:'playback',at_ms:4000,reason:'NATIVE_PLAYBACK_FAILED'}]}]},{now:()=>Date.parse('2026-10-28T06:00:00Z'),reportId:'ui-fixture'});

test('dashboard script parses without embedding credentials or unsafe HTML templates',()=>{
 assert.doesNotThrow(()=>new Function(masterDashboardJs));
 assert.match(masterDashboardHtml,/dir="rtl"/);assert.match(masterDashboardHtml,/تنزيل تقرير التشخيص/);
 assert(!/innerHTML\s*=|localStorage|sessionStorage|document\.cookie/.test(masterDashboardJs));
 assert.match(masterDashboardJs,/\/api\/v1\/admin\/report/);
});

test('Arabic dashboard is usable on mobile, desktop and TV with a downloadable safe report',{skip:!chrome},async()=>{
 const {chromium}=await import('playwright-core');const report=sample(),requests=[];
 const server=http.createServer((req,res)=>{
  requests.push({url:req.url,authorization:req.headers.authorization});
  const paths={'/admin':['text/html',masterDashboardHtml],'/admin/style.css':['text/css',masterDashboardCss],'/admin/app.js':['text/javascript',masterDashboardJs]};
  if(paths[req.url]){res.writeHead(200,{'Content-Type':paths[req.url][0],'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});res.end(paths[req.url][1]);return;}
  if(req.url==='/api/v1/admin/report'){res.writeHead(req.headers.authorization==='Bearer fixture-admin-key'?200:401,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(req.headers.authorization==='Bearer fixture-admin-key'?report:{message:'DIAGNOSTICS_AUTH_REQUIRED'}));return;}
  res.writeHead(404);res.end();
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:chrome,args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});
 try{
  for(const [width,height,colorScheme]of [[390,844,'dark'],[1280,900,'light'],[1920,1080,'dark']]){
   const context=await browser.newContext({viewport:{width,height},colorScheme,acceptDownloads:true});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port+'/admin');
   await page.locator('#key').fill('wrong-key');await page.locator('#connect').click();await page.waitForFunction(()=>document.getElementById('status').classList.contains('error'));
   assert.match(await page.locator('#status').innerText(),/غير صحيح/);
   await page.locator('#key').fill('fixture-admin-key');await page.locator('#connect').click();await page.locator('#dashboard').waitFor({state:'visible'});
   assert.equal(await page.locator('#key').inputValue(),'');assert.match(await page.locator('#scope').innerText(),/الإجمالي/);
   const counter=await page.locator('#counters .counter strong').allTextContents();assert.deepEqual(counter,['١٢','٢','١٣٣','٣٦']);
   await page.locator('[data-view="works"]').click();assert.match(await page.locator('#view').innerText(),/مدبلج · نسخة مستقلة/);assert.match(await page.locator('#view').innerText(),/توجد فجوات/);
   await page.locator('[data-view="traces"]').click();assert.match(await page.locator('#view').innerText(),/أُرسل الطلب للمصدر/);assert.match(await page.locator('#view').innerText(),/إصدار التطبيق: 1\.1\.6/);assert.match(await page.locator('#view').innerText(),/داخل مشغل التطبيق/);assert.match(await page.locator('#report-meta').innerText(),/إصدار الخادم: 1\.1\.7/);
   assert.equal(await page.locator('#source-code').getAttribute('href'),'https://github.com/th-505/MATV/archive/'+'a'.repeat(40)+'.zip');
   const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download').click()]);
   const stream=await download.createReadStream();let text='';for await(const chunk of stream)text+=chunk.toString('utf8');assert.deepEqual(JSON.parse(text),report);assert(!text.includes('fixture-admin-key'));
   const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,local:localStorage.length,session:sessionStorage.length,buttons:[...document.querySelectorAll('button:not([disabled]),a.button:not([hidden])')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect().height)}));
   assert.equal(metrics.overflow,false,width+'px overflow');assert.equal(metrics.local,0);assert.equal(metrics.session,0);assert(metrics.buttons.every(n=>n>=(width>=1280?64:48)));
   assert.deepEqual(errors,[]);
   if(process.env.NAJD_SCREENSHOT_DIR){mkdirSync(process.env.NAJD_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:process.env.NAJD_SCREENSHOT_DIR+'/dashboard-'+width+'-'+colorScheme+'.png',fullPage:true});}
   await page.locator('#disconnect').click();assert.equal(await page.locator('#dashboard').isVisible(),false);assert.equal(await page.locator('#technical-data').innerText(),'');
   await context.close();
  }
  assert(requests.filter(r=>r.authorization==='Bearer fixture-admin-key').every(r=>r.url==='/api/v1/admin/report'));
  assert(requests.every(r=>!r.url.includes('fixture-admin-key')));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
