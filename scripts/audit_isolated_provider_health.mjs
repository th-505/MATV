// Owner-run audit: contains no resolved links, searches, cookies or credentials in output.
import {writeFile,mkdir} from 'node:fs/promises';
import {createServiceChecks} from '../server/diagnostics/service-checks.mjs';
const scope=process.argv.find(a=>a.startsWith('--scope='))?.split('=')[1]||'beta';
if(!['beta','najd'].includes(scope))throw Error('SCOPE_REQUIRED');
const folder=process.env.NAJD_AUDIT_DIR||'/tmp/najd-isolated-audit';await mkdir(folder,{recursive:true});
const checks=createServiceChecks(),job=checks.start(scope),deadline=Date.now()+180000;
let report;
do{
 report=checks.status(job.id);await writeFile(folder+'/'+scope+'.json',JSON.stringify({...report,observed_at:new Date().toISOString(),basis:'real-source-catalog-search-details-and-container-probe; not device decoding'},null,2));
 if(report.state==='ready')break;
 await new Promise(r=>setTimeout(r,1000));
}while(Date.now()<deadline);
console.log(JSON.stringify({scope,state:report.state,finished:report.finished,total:report.total,checks:report.checks.map(row=>({id:row.id,state:row.state,reason:row.reason,stages:row.stages,duration_ms:row.duration_ms}))}));
// A provider's internally bounded requests may still be settling at the audit deadline.
process.exit(report.state==='ready'?0:2);
