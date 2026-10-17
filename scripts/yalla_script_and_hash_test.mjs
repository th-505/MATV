// scripts/yalla_script_and_hash_test.mjs
import * as yallaMod from '../server/scrapers/sites/yallashoot.mjs';
import { extractRawStreamsFromText } from '../server/scrapers/stream-unwrapper.mjs';
import { resolveSafeUrl } from '../server/scrapers/shared/http.mjs';

const htmlWithScript = `
<!DOCTYPE html>
<html>
<body>
  <div class="match-container">
    <a href="#">Should be ignored raw hash</a>
    <a href="https://yalla-shootz.cc/match/123#tab-server">Should be ignored targetUrl hash</a>
    <a href="/match/123">Real Match Link</a>
  </div>
  <div class="asp-server-name">
    <a href="#" data-url="#">Ignored hash server</a>
    <a href="#" data-url="https://yalla-shootz.cc/match/123#">Ignored target hash</a>
    <a href="#" data-url="https://embed.live-server.com/player/v1">Valid Embed Server</a>
    <a href="#" data-url="https://doubleclick.net/ads/player">Ad host must never be a server</a>
  </div>
  <script>
    var playerConfig = {
      source: "https://edge-stream.test/live/ch1/index.m3u8",
      poster: "https://edge-stream.test/poster.jpg"
    };
  </script>
</body>
</html>
`;

async function test() {
  console.log('=== TESTING YALLASHOOT SCRIPT STREAMS & HASH EXCLUSION ===');

  // 1. Raw Stream inside Script
  const streams = extractRawStreamsFromText(htmlWithScript, 'https://yalla-shootz.cc/match/123');
  console.log('1. Script regex extraction:', streams);
  if (!streams.some(s => s.url.includes('index.m3u8'))) {
    throw new Error('FAIL: Script stream index.m3u8 was not extracted!');
  }
  console.log('   ✓ Successfully extracted .m3u8 from inline JS script');

  // 2. href="#" Exclusion Before and After Normalization
  const targetUrl = 'https://yalla-shootz.cc/match/123';
  const rawHashNormalized = resolveSafeUrl('#', targetUrl);
  console.log('2.1 resolveSafeUrl("#") ->', rawHashNormalized);

  const targetHashNormalized = resolveSafeUrl('https://yalla-shootz.cc/match/123#tab', targetUrl);
  console.log('2.2 resolveSafeUrl("target#tab") ->', targetHashNormalized);

  const servers = await yallaMod.scrapeServers(targetUrl, { fixtureHtml: htmlWithScript });
  console.log('2.3 Scraped Servers:', servers);

  const hasHashServer = servers.some(s => s.url === '#' || s.url.endsWith('#') || s.url.includes('#tab'));
  if (hasHashServer) {
    throw new Error('FAIL: Found server with # or hash fragment!');
  }
  console.log('   ✓ All href="#" and hash fragment servers successfully excluded');

  const hasValidServer = servers.some(s => s.url.includes('embed.live-server.com'));
  const hasScriptServer = servers.some(s => s.url.includes('index.m3u8'));
  if (!hasValidServer) throw new Error('FAIL: scrapeServers did not include the expected embed server');
  if (!hasScriptServer) throw new Error('FAIL: scrapeServers did not include the script-extracted HLS source');
  if (servers.length !== 2) throw new Error(`FAIL: Expected exactly 2 clean servers, got ${servers.length}`);
  const scriptServer = servers.find(s => s.url.includes('index.m3u8'));
  if (scriptServer?.type !== 'm3u8' || scriptServer?.streamType !== 'm3u8') {
    throw new Error('FAIL: Script stream was not classified as an HLS server');
  }
  if (servers.some(s => /doubleclick|googleads|popads|#|yalla-shootz\.cc\/match\/123/i.test(s.url))) {
    throw new Error('FAIL: Ad URLs, hash links or the match page itself were accepted as playback servers');
  }
  if (servers.some(s => s.source !== 'yallashoot')) throw new Error('FAIL: Provider identity was not preserved');
  console.log('   ✓ scrapeServers returned one embed and one HLS source, with no hash/page/ad entries');

  console.log('=== TEST PASSED 100% ===');
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
