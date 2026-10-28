import {workReference} from '../harvest/work-reference.mjs';
import {getProvider} from '../scrapers/registry.mjs';
const platforms=['tv','mobile','ios','desktop','web','native','unknown'];
const phases=['startup','initialization','initialize','metadata','resolve','playback','buffering','source_refresh','refresh','decoder','handoff','unknown'];
export function clientDiagnosticContext(raw={}){
 const build=Number(raw.client_build);
 return{platform:platforms.includes(raw.platform)?raw.platform:'unknown',client_version:/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(String(raw.client_version||''))?raw.client_version:null,client_build:Number.isSafeInteger(build)&&build>=1&&build<=1e9?build:null};
}
export function parsePlaybackFeedback(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('INVALID_PLAYBACK_FEEDBACK');
 const match=String(raw.ref||'').match(/^(tmdb:(?:tv|movie):[1-9]\d{0,9}|source:[a-z0-9_-]{2,30}:[a-f0-9]{24})(?::s(\d{1,3}):e(\d{1,6}))?$/);
 if(!match)throw Error('INVALID_PLAYBACK_REFERENCE');const ref=workReference(match[1]);
 const code=raw.code;if(!['NATIVE_DECODER_ERROR','BUFFER_STALLED','PLAYER_START_FAILED','NATIVE_PLAYBACK_FAILED'].includes(code))throw Error('INVALID_PLAYBACK_CODE');
 return{work_ref:ref,provider:getProvider(raw.provider)?.meta?.id|| (ref.startsWith('source:')?ref.split(':')[1]:'unknown'),stage:'playback',outcome:'failed',reason:code,details:{...clientDiagnosticContext(raw),phase:phases.includes(raw.phase)?raw.phase:'playback',...(match[2]?{season:Number(match[2]),episode:Number(match[3])}:{})}};
}
