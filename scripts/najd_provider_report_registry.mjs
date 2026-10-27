/** Export the application's actual registry; never use the obsolete handover seeds. */
import {listProviders} from '../server/scrapers/registry.mjs';
import {listSourceCapabilities} from '../server/scrapers/source-registry.mjs';
const labels=new Map(listSourceCapabilities().map(source=>[source.id,source.name_ar+' — '+source.domain]));
const providers = listProviders().map(meta => {
  const raw = meta.domains?.[0];
  const url = new URL(/^https:\/\//.test(raw || '') ? raw : `https://${raw}`);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) throw Error('INVALID_PROVIDER_ORIGIN');
  return {id: meta.id, name: labels.get(meta.id)||meta.name, url: url.href, enabled: meta.enabled !== false, mirror_of: meta.mirrorOf || null};
});
console.log(JSON.stringify({description: 'Actual application registry; mirrors remain explicitly identified', providers}, null, 2));
