import { fetchSafeResponse } from '../server/scrapers/shared/http.mjs';

async function testShahid() {
  try {
    const res = await fetchSafeResponse('https://shahidfu.cam/', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeoutMs: 5000
    });
    console.log('Status:', res.status, 'HTML length:', res.html?.length);
    const m = res.html.match(/<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<\/a>/gi) || [];
    console.log('Total anchor tags:', m.length);
  } catch (e) {
    console.error('Error fetching shahidfu.cam:', e.message);
  }
}
testShahid();
