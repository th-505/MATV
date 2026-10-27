const THEME_KEY='najd.theme.v1';
export function applyNajdTheme(choice='dark') {
 const preference=['light','dark','system'].includes(choice)?choice:'dark';
 const actual=preference==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):preference;
 document.documentElement.dataset.najdTheme=actual;document.documentElement.style.colorScheme=actual;
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',actual==='light'?'#fcfcff':'#08080e');
 try{localStorage.setItem(THEME_KEY,preference)}catch{}return actual;
}
export function measureNajdViewport() {
 const v=window.visualViewport;
 return {width:Math.round(v?.width||innerWidth),height:Math.round(v?.height||innerHeight),layout_width:innerWidth,layout_height:innerHeight,dpr:Math.round(devicePixelRatio*100)/100,screen_width:screen.width,screen_height:screen.height,orientation:innerWidth>innerHeight?'landscape':'portrait',platform:'web'};
}
function setup(){
 let choice='dark';try{choice=localStorage.getItem(THEME_KEY)||'dark'}catch{}applyNajdTheme(choice);
 const select=document.getElementById('najdTheme');if(select){select.value=choice;select.addEventListener('change',()=>applyNajdTheme(select.value));}
 matchMedia('(prefers-color-scheme: light)').addEventListener?.('change',()=>{if(select?.value==='system')applyNajdTheme('system')});
 const dialog=document.getElementById('najdIntro');
 if(dialog&&!location.hash&&!new URLSearchParams(location.search).has('ref')){
  let timer;const close=()=>{clearTimeout(timer);dialog.close();document.getElementById('brandBtn')?.focus({preventScroll:true})};
  document.getElementById('najdIntroContinue').addEventListener('click',close);dialog.addEventListener('cancel',()=>clearTimeout(timer));dialog.showModal();timer=setTimeout(close,14000);
 }
 const metrics=document.getElementById('najdViewport');const update=()=>{const profile=measureNajdViewport();if(metrics)metrics.textContent=`${profile.width} × ${profile.height} · ${profile.dpr} DPR`;window.dispatchEvent(new CustomEvent('najd:viewport',{detail:profile}));};
 update();window.addEventListener('resize',update,{passive:true});window.visualViewport?.addEventListener('resize',update,{passive:true});
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();}
