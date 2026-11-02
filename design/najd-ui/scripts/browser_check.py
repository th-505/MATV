import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
import os
BASE=os.environ.get('NAJD_UI_BASE_URL','http://127.0.0.1:4173/ui/')
PRIVATE=os.environ.get('NAJD_PRIVATE_FONTS')=='1'
async def main():
 errors=[];report=[];screens=json.loads((ROOT/'ui/manifest.json').read_text())
 async with async_playwright() as p:
  browser=await p.chromium.launch();sem=asyncio.Semaphore(5)
  async def check(r):
   async with sem:
    tv=r['platform']=='تلفزيون';land=r['slug']=='player';page=await browser.new_page(viewport={'width':1920 if tv else 844 if land else 390,'height':1080 if tv else 390 if land else 844})
    faults=[];page.on('pageerror',lambda e:faults.append(str(e)))
    await page.route('https://**/*',lambda route:route.abort())
    if not PRIVATE:await page.route('**/assets/private-fonts/**',lambda route:route.abort())
    response=await page.goto(BASE+r['path'],wait_until='networkidle');await page.evaluate('document.fonts.ready');await page.evaluate('(family)=>document.fonts.load(`16px "${family}"`)', 'Thmanyah' if PRIVATE else 'NajdFallback')
    loaded=await page.evaluate('(family)=>document.fonts.check(`16px "${family}"`)', 'Thmanyah' if PRIVATE else 'NajdFallback');broken=await page.locator('img').evaluate_all('(imgs)=>imgs.filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.src)')
    if response.status!=200 or faults or not loaded or broken:errors.append({'id':r['id'],'status':response.status,'errors':faults,'font':loaded,'fontMode':'private-thmanyah' if PRIVATE else 'redistributable-fallback','brokenImages':broken})
    report.append({'id':r['id'],'offlineResources':not broken,'font':loaded,'fontMode':'private-thmanyah' if PRIVATE else 'redistributable-fallback','jsErrors':faults})
    await page.close()
  await asyncio.gather(*(check(r) for r in screens))
  page=await browser.new_page(viewport={'width':390,'height':844})
  await page.goto(BASE+'index.html');await page.locator('#filter').fill('NJD-081');assert await page.locator('.catalog-card:visible').count()==1
  await page.goto(BASE+'screens/watchlist-edit-dark/index.html');await page.locator('[data-select-all]').click();assert await page.locator('.poster input:checked').count()==6;await page.locator('[data-remove-selection]').click();assert await page.locator('.poster').count()==0
  await page.goto(BASE+'screens/quality-picker-light/index.html');await page.get_by_label('720p · HD').check();assert await page.get_by_label('720p · HD').is_checked()
  await page.goto(BASE+'screens/tv-search-dark/index.html');await page.locator('[data-key="ب"]').click();assert await page.locator('.search').input_value()=='ب';await page.locator('[data-backspace]').click();assert await page.locator('.search').input_value()=='';await page.locator('[data-key="أ"]').focus();await page.keyboard.press('ArrowLeft');assert await page.evaluate('document.activeElement.tagName')=='BUTTON'
  await page.close();await browser.close()
 (ROOT/'planning/browser-check.json').write_text(json.dumps({'screens':report,'failures':errors,'interactionChecks':['catalogue filter','watchlist bulk selection/removal preview','quality selection','TV keyboard input/delete/directional navigation']},ensure_ascii=False,indent=2))
 assert not errors,json.dumps(errors,ensure_ascii=False)
 print('PASS: 81 screens offline, fonts/images, no JS errors, and four interaction flows')
asyncio.run(main())
