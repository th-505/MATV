import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';
const chrome=[process.env.CHROME_PATH,'/usr/bin/chromium','/usr/bin/google-chrome','/home/agent/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'].find(p=>p&&existsSync(p));
test('browser video bridge selects an active shadow-root video and falls back from unsupported standard PiP',{skip:!chrome},async()=>{
 const {chromium}=await import('playwright-core');const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.setContent('<div id="flutter-host"></div>');
 await page.evaluate(()=>{const root=document.querySelector('#flutter-host').attachShadow({mode:'open'});const video=document.createElement('video');video.id='active';video.webkitPresentationMode='inline';video.webkitSetPresentationMode=mode=>video.webkitPresentationMode=mode;video.webkitSupportsPresentationMode=()=>true;root.append(video);Object.defineProperty(document,'pictureInPictureEnabled',{get:()=>false,configurable:true});});
 await page.addScriptTag({content:readFileSync('flutter_app/web/najd-video.js','utf8')});
 assert.equal(await page.evaluate(()=>NajdWebVideo.findVideo().id),'active');assert.equal(await page.evaluate(()=>NajdWebVideo.availablePip()),true);
 assert.equal(await page.evaluate(()=>NajdWebVideo.enterPip()),true);
 assert.equal(await page.evaluate(()=>NajdWebVideo.findVideo().webkitPresentationMode),'picture-in-picture');
 await page.evaluate(()=>{Object.defineProperty(document,'pictureInPictureEnabled',{get:()=>true,configurable:true});NajdWebVideo.findVideo().requestPictureInPicture=()=>Promise.reject(Error('not permitted here'));});
 assert.equal(await page.evaluate(()=>NajdWebVideo.enterPip()),true);
 }finally{await browser.close();}
});
test('quality selection uses observed HLS levels, preserves playback and disposes replaced controllers',{skip:!chrome},async()=>{
 const {chromium}=await import('playwright-core');const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
 try {const page=await browser.newPage();await page.setContent('<video></video>');
 await page.evaluate(()=>{window.Hls=class {constructor(){this.levels=[{height:720,bitrate:2000000},{height:1080,bitrate:4000000}];this.nextLevel=-1;this.destroyed=false;}attachMedia(video){this.media=video;}destroy(){this.destroyed=true;}};});
 await page.addScriptTag({content:readFileSync('flutter_app/web/najd-video.js','utf8')});
 const result=await page.evaluate(()=>{const video=document.querySelector('video');video.currentTime=42;const first=new Hls();first.attachMedia(video);const options=NajdWebVideo.qualityOptions();const selected=NajdWebVideo.selectQuality(1);const invalid=NajdWebVideo.selectQuality(4);const clock=video.currentTime;const second=new Hls();second.attachMedia(video);return {options,selected,invalid,clock,chosen:first.nextLevel,destroyed:first.destroyed,automatic:second.nextLevel};});
 assert.deepEqual(result.options.map(x=>x.id),[-1,0,1]);assert.equal(result.options[2].height,1080);assert.equal(result.selected,true);assert.equal(result.invalid,false);assert.equal(result.clock,42);assert.equal(result.chosen,1);assert.equal(result.destroyed,true);assert.equal(result.automatic,-1);
 }finally{await browser.close();}
});
test('fullscreen uses the document to retain player controls and falls back to Safari video fullscreen',{skip:!chrome},async()=>{
 const {chromium}=await import('playwright-core');const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.setContent('<video></video>');await page.addScriptTag({content:readFileSync('flutter_app/web/najd-video.js','utf8')});
 assert.equal(await page.evaluate(async()=>{let called=false;document.documentElement.requestFullscreen=async()=>{called=true;};return await NajdWebVideo.enterFullscreen()&&called;}),true);
 assert.equal(await page.evaluate(async()=>{let called=false;document.documentElement.requestFullscreen=async()=>{throw Error('unsupported');};document.documentElement.webkitRequestFullscreen=undefined;document.querySelector('video').webkitEnterFullscreen=()=>{called=true;};return await NajdWebVideo.enterFullscreen()&&called;}),true);
 }finally{await browser.close();}
});
