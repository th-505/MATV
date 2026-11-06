// Private captures stay outside Git. Only counts/diagnostics are printed.
import {readFileSync} from 'node:fs';
import {parseFiveTvCatalog, parseFiveTvDetails} from '../server/scrapers/sites/fivetv.mjs';
const path = process.argv[2];
if (!path) throw Error('Usage: node scripts/fivetv_capture_audit.mjs /private/capture.json');
const capture = JSON.parse(readFileSync(path, 'utf8'));
const stats = {records: capture.records.length, html: 0, details: 0, catalogs: 0,
  catalog_items: 0, episode_references: 0, watch_servers: 0, unsupported_pages: 0, failures: 0};
for (const record of capture.records) {
  if (!String(record.type).includes('html')) continue;
  stats.html++;
  try {
    const path = new URL(record.url).pathname;
    if (/^\/(series|movie|episode)\//.test(path)) {
      const details = parseFiveTvDetails(record.body, record.url);
      stats.details++;
      stats.episode_references += details.episodes.length;
      stats.watch_servers += details.servers.length;
    } else if (['/vip/', '/schedule/', '/my-list/', '/discover/'].includes(path)) {
      // These are not public catalog lists; do not pretend that zero cards is a pass.
      stats.unsupported_pages++;
    } else {
      const rows = parseFiveTvCatalog(record.body, record.url);
      stats.catalogs++;
      stats.catalog_items += rows.length;
      if (!rows.length || rows._meta?.ok === false) stats.failures++;
    }
  } catch { stats.failures++; }
}
console.log(JSON.stringify(stats, null, 2));
if (stats.failures) process.exitCode = 1;
