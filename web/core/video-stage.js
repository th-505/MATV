import { browserDirectSource } from './playback-client.js';
export function createVideoStage({video,HlsImpl=globalThis.Hls,onState=()=>{},onSource=()=>{},startupMs=20000}={}){
 if(!video)throw Error('VIDEO_ELEMENT_REQUIRED');
 let generation=0,disposeSource=()=>{},pool=[],index=0,hls=null;
 function stop(){generation++;disposeSource();disposeSource=()=>{};try{hls?.destroy();}catch{}hls=null;video.pause();video.removeAttribute('src');video.load();}
 function playSources(raw,{startIndex=0,resumePosition=0}={}){
  stop();const token=generation;
  pool=raw.map(browserDirectSource).filter(Boolean);index=Math.max(0,Math.min(startIndex,pool.length-1));
  let attempted=0;
  const next=()=>{
   if(token!==generation)return;
   disposeSource();try{hls?.destroy();}catch{}hls=null;
   if(attempted++>=pool.length){onState({state:'unavailable',reason:'ALL_SOURCES_FAILED'});return;}
   const source=pool[index++%pool.length];if(!source){onState({state:'unavailable',reason:'NO_PLAYABLE_SOURCE'});return;}
   let finished=false;const listeners=[];
   const listen=(name,handler)=>{video.addEventListener(name,handler);listeners.push([name,handler]);};
   let timer=setTimeout(()=>{if(token===generation&&!finished)next();},startupMs);
   disposeSource=()=>{finished=true;clearTimeout(timer);for(const [name,fn]of listeners)video.removeEventListener(name,fn);};
   const fail=()=>{if(token===generation&&!finished)next();};
   const play=()=>{
    if(token!==generation || finished)return;
    Promise.resolve(video.play()).catch(error=>{
     if(token!==generation||finished)return;
     if(error?.name==='NotAllowedError'){
      clearTimeout(timer);onState({state:'awaiting-user',reason:'AUTOPLAY_BLOCKED'});
     }else if(error?.name!=='AbortError')fail();
    });
   };
   listen('playing',()=>{clearTimeout(timer);onState({state:'playing',source});});
   listen('loadedmetadata',()=>{
    if(resumePosition>0&&Number.isFinite(video.duration)&&resumePosition<video.duration-3)video.currentTime=resumePosition;
   });
   listen('error',fail);listen('canplay',play);
   video.controls=true;video.playsInline=true;video.style.display='block';
   onSource(source);onState({state:'loading',source});
   if(source.type==='m3u8'&&!video.canPlayType('application/vnd.apple.mpegurl')){
    if(!HlsImpl?.isSupported?.()){fail();return;}
    hls=new HlsImpl({enableWorker:true,maxBufferLength:30});
    hls.on(HlsImpl.Events.MANIFEST_PARSED,play);
    hls.on(HlsImpl.Events.ERROR,(_event,data)=>{if(data?.fatal)fail();});
    hls.loadSource(source.url);hls.attachMedia(video);
   }else{video.src=source.url;video.load();play();}
  };next();
 }
 return Object.freeze({playSources,stop});
}
