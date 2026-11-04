import {listProviders} from './registry.mjs';
import {createHash} from 'node:crypto';

// Metadata only: clients never download or execute scraper code or supplied routes.
export function sourceManifest(providers = listProviders()) {
  const data = providers.filter(meta => /^[a-z0-9][a-z0-9_-]{1,29}$/.test(meta.id))
    .map(meta => ({id: meta.id, name: meta.name, enabled: meta.enabled !== false,
      mirror_of: meta.mirrorOf || null, domain: new URL(meta.domains[0]).hostname,
      capabilities: Object.fromEntries(['catalog','search','details','episodes','servers','resolve','live']
        .map(key => [key, meta.capabilities?.[key] === true])),
      reference_protocol: 'najd-source-v1', playback_formats: ['mp4','m3u8'],
    }));
  return {status:'success', schema_version:1, refresh_after_seconds:300,
    revision:createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0,24), data};
}
