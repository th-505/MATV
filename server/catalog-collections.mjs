import {readFileSync} from 'node:fs';
export const CATALOG_COLLECTIONS=Object.freeze(JSON.parse(readFileSync(new URL('../shared/catalog-collections.json',import.meta.url),'utf8')));
export function collectionRequest(ref,page,now=new Date()){
 const row=CATALOG_COLLECTIONS.find(r=>r.id===ref);if(!row)return null;
 const date=n=>new Date(now.getTime()+n*86400000).toISOString().slice(0,10);
 const params={page:String(page),sort_by:'popularity.desc',...row.params};
 if(row.window==='year')params[row.type==='movie'?'primary_release_year':'first_air_date_year']=String(now.getUTCFullYear());
 if(row.window==='past')params[row.type==='movie'?'primary_release_date.lte':'first_air_date.lte']=date(0);
 if(row.window==='week'||row.window==='upcoming'){
  params['air_date.gte']=date(row.window==='week'?-6:0);params['air_date.lte']=date(row.window==='week'?0:7);
 }
 return{path:`/discover/${row.type}`,type:row.type,params};
}
