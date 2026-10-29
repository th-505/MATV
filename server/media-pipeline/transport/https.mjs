import https from 'node:https';
import dns from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';
const denied=new BlockList(),globalV6=new BlockList();globalV6.addSubnet('2000::',3,'ipv6');
for(const [address,prefix]of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]])denied.addSubnet(address,prefix,'ipv4');
for(const [address,prefix]of [['::',128],['::1',128],['64:ff9b::',96],['100::',64],['2001:db8::',32],['2001::',32],['2002::',16],['fc00::',7],['fe80::',10],['ff00::',8]])denied.addSubnet(address,prefix,'ipv6');
const fail=code=>Object.assign(Error(code),{code});
export function isPublicAddress(address){const family=isIP(address);return family!==0&&(family!==6||globalV6.check(address,'ipv6'))&&!denied.check(address,family===4?'ipv4':'ipv6');}
export function assertPublicHttpsUrl(raw){
 if(typeof raw!=='string'||raw.length>4096||/[\u0000-\u0020\u007f\\]/.test(raw))throw fail('TRANSPORT_UNSAFE_URL');
 const u=new URL(raw),host=u.hostname.replace(/^\[|\]$/g,'');
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||/^(localhost|.*\.(local|localhost|internal))\.?$/i.test(host)||isIP(host)&&!isPublicAddress(host))throw fail('TRANSPORT_UNSAFE_URL');
 return u;
}
/** New pipeline transport: pinned DNS, guarded redirects and bounded binary reads. */
export async function readHttps(raw,{headers={},timeoutMs=8000,maxBytes=262144,prefixBytes=0,maxRedirects=2,lookup=dns.lookup,request=https.request}={}){
 const deadline=Date.now()+Math.min(15000,Math.max(1,timeoutMs));let current=assertPublicHttpsUrl(raw),previousOrigin=current.origin;
 let forwarded={...headers};
 for(let hop=0;hop<=maxRedirects;hop++){
  const records=await Promise.race([lookup(current.hostname.replace(/^\[|\]$/g,''),{all:true,verbatim:true}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(fail('TRANSPORT_TIMEOUT')),Math.max(1,deadline-Date.now()));timer.unref?.();})]);
  if(!records.length||records.length>16||records.some(r=>!isPublicAddress(r.address)))throw fail('TRANSPORT_UNSAFE_DNS');
  if(current.origin!==previousOrigin)forwarded=Object.fromEntries(Object.entries(forwarded).filter(([k])=>! /^(cookie|authorization|proxy-authorization)$/i.test(k)));
  previousOrigin=current.origin;
  const response=await new Promise((resolve,reject)=>{
   const chunks=[];let size=0,settled=false;
   let absoluteTimer;const finish=value=>{if(settled)return;settled=true;clearTimeout(absoluteTimer);resolve(value);};
   const abort=e=>{if(settled)return;settled=true;clearTimeout(absoluteTimer);reject(e);};
   const socketLookup=(_host,options,cb)=>options?.all?cb(null,records):cb(null,records[0].address,records[0].family);
   const req=request(current,{method:'GET',headers:{...forwarded,'Accept-Encoding':'identity'},lookup:socketLookup,agent:false},res=>{
    const status=res.statusCode||0,result=()=>({status,url:current.href,headers:res.headers,bytes:Buffer.concat(chunks)});
    if([301,302,303,307,308].includes(status)){finish(result());res.destroy();return;}
    if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){abort(fail('TRANSPORT_ENCODING_UNSUPPORTED'));res.destroy();return;}
    res.on('data',chunk=>{
     if(settled)return;
     const remaining=prefixBytes?prefixBytes-size:chunk.length;const part=chunk.subarray(0,Math.max(0,remaining));size+=part.length;
     if(size>maxBytes){abort(fail('TRANSPORT_BODY_LIMIT'));res.destroy();return;}
     chunks.push(part);
     if(prefixBytes&&size>=prefixBytes){finish(result());res.destroy();}
    });
    res.on('end',()=>finish(result()));res.on('error',e=>{abort(e);});
   });
   absoluteTimer=setTimeout(()=>req.destroy(fail('TRANSPORT_TIMEOUT')),Math.max(1,deadline-Date.now()));absoluteTimer.unref?.();
   req.setTimeout(Math.max(1,deadline-Date.now()),()=>req.destroy(fail('TRANSPORT_TIMEOUT')));req.on('error',e=>{abort(e);});req.end();
  });
  if(![301,302,303,307,308].includes(response.status))return response;
  if(!response.headers.location)throw fail('TRANSPORT_REDIRECT_MISSING');
  current=assertPublicHttpsUrl(new URL(response.headers.location,current).href);
 }
 throw fail('TRANSPORT_REDIRECT_LIMIT');
}
