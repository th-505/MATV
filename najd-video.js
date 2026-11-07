/* Public browser APIs only. No player URLs, session data, or browser fingerprints are logged. */
(() => {
  const hlsPlayers = new WeakMap();
  const hookHls = () => {
    const proto=window.Hls?.prototype;
    if(!proto || proto.__najdTracked || typeof proto.attachMedia!=='function') return;
    const original=proto.attachMedia;
    proto.attachMedia=function(video){
      const old=hlsPlayers.get(video);
      if(old && old!==this) old.destroy();
      hlsPlayers.set(video,this);
      return original.call(this,video);
    };
    Object.defineProperty(proto,'__najdTracked',{value:true});
  };
  document.addEventListener('load',event=>{if(event.target?.tagName==='SCRIPT')hookHls();},true);
  hookHls();
  const findVideo = () => {
    const roots = [document], found = []; let visited = 0;
    for (let i = 0; i < roots.length && i < 64; i++) {
      for (const node of roots[i].querySelectorAll('*')) {
        if (++visited > 6000) break;
        if (node.tagName === 'VIDEO' && node.isConnected) found.push(node);
        if (node.shadowRoot && roots.length < 64) roots.push(node.shadowRoot);
      }
    }
    return found.sort((a,b) => Number(!b.paused)-Number(!a.paused) || Number(b.readyState>0)-Number(a.readyState>0))[0] || null;
  };
  const prepare = video => {
    if (!video) return;
    video.setAttribute('playsinline',''); video.setAttribute('webkit-playsinline','');
    video.disablePictureInPicture = false;
  };
  const availablePip = () => {
    const v = findVideo(); if (!v) return false; prepare(v);
    return Boolean((document.pictureInPictureEnabled && v.requestPictureInPicture) ||
      (v.webkitSetPresentationMode && (!v.webkitSupportsPresentationMode || v.webkitSupportsPresentationMode('picture-in-picture'))));
  };
  const enterPip = async () => {
    const v=findVideo(); if(!v)return false; prepare(v);
    if(document.pictureInPictureEnabled && v.requestPictureInPicture) {
      try {await v.requestPictureInPicture(); return document.pictureInPictureElement===v;} catch (_) {}
    }
    if(v.webkitSetPresentationMode) {
      try {v.webkitSetPresentationMode('picture-in-picture'); return v.webkitPresentationMode==='picture-in-picture';} catch (_) {}
    }
    return false;
  };
  const enterFullscreen = async () => {
    const v=findVideo(); if(!v)return false; prepare(v);
    if(document.fullscreenElement || document.webkitFullscreenElement) {
      try {await (document.exitFullscreen?.() || document.webkitExitFullscreen?.());return true;} catch(_){return false;}
    }
    const root=document.documentElement;
    try {if(root.requestFullscreen){await root.requestFullscreen();return true;}}catch(_){}
    try {if(root.webkitRequestFullscreen){root.webkitRequestFullscreen();return true;}}catch(_){}
    try {if(v.webkitEnterFullscreen){v.webkitEnterFullscreen();return true;}}catch(_){}
    return false;
  };
  const qualityOptions = () => {
    const player=hlsPlayers.get(findVideo());
    if(!player || !Array.isArray(player.levels))return [];
    return [{id:-1,label:'تلقائي'},...player.levels.map((level,id)=>({id,label:level.height?`${level.height}p${level.videoCodec?' · '+level.videoCodec:''}`:`${Math.round((level.bitrate||0)/1000)} kbps`,height:level.height||null,bitrate:level.bitrate||null}))];
  };
  const selectQuality = id => {
    const player=hlsPlayers.get(findVideo());
    if(!player || !Number.isInteger(id) || id < -1 || id>=player.levels.length)return false;
    player.nextLevel=id; return true;
  };
  const diagnostics = () => {
    const v=findVideo();if(!v)return {};
    const playback=v.getVideoPlaybackQuality?.();const box=v.getBoundingClientRect();
    return {width:v.videoWidth,height:v.videoHeight,displayWidth:Math.round(box.width*devicePixelRatio),displayHeight:Math.round(box.height*devicePixelRatio),droppedFrames:playback?.droppedVideoFrames??null,totalFrames:playback?.totalVideoFrames??null,adaptiveLevels:qualityOptions().length};
  };
  window.NajdWebVideo={findVideo,availablePip,enterPip,enterFullscreen,qualityOptions,selectQuality,diagnostics};
})();
