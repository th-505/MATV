// scripts/ssrf_http_guard_test.mjs
// Centralized verification test for shared/http.mjs SSRF protections:
// - Protocol allowlist (https/http only, block file:, javascript:, data:, ftp:, gopher:)
// - Embedded credentials rejection
// - Private/Loopback/Link-Local/Reserved IPv4 (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 100.64.0.0/10, 0.0.0.0)
// - Full IPv6 normalization & private/mapped ranges (::1, [0:0:0:0:0:0:0:1], ::ffff:127.0.0.1, [::ffff:7f00:1], [::ffff:a9fe:a9fe], fc00::/7, fe80::/10, 6to4 2002:7f00:1::, Teredo, NAT64 64:ff9b::127.0.0.1)
// - Multi-hop redirect validation (blocking redirects to private IPv4, IPv6, or unsafe protocols)
// - Asynchronous DNS resolution validation (blocking DNS rebinding / domains resolving to private IPv4 or IPv6 on initial or redirect hops)

import assert from 'node:assert/strict';
import {
  assertSafeScraperUrl,
  assertSafeResolvedHost,
  fetchSafeResponse,
  isUnsafeHostname,
  isUnsafeIpAddress
} from '../server/scrapers/shared/http.mjs';

async function runTests() {
  // 1. Unsafe protocols & credentials
  for (const unsafeUrl of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'ftp://files.example.com/movie.mp4',
    'https://user:pass@example.com/watch',
    'https://admin@example.com/watch'
  ]) {
    assert.throws(
      () => assertSafeScraperUrl(unsafeUrl, { allowHttp: true }),
      (err) => err.code === 'UNSAFE_URL',
      `Expected UNSAFE_URL for ${unsafeUrl}`
    );
  }

  // 2. Private/Loopback/Link-Local IPv4 & Obfuscated IPv4
  for (const unsafeHost of [
    'localhost',
    'sub.localhost',
    'internal.local',
    'db.internal',
    '0.0.0.0',
    '127.0.0.1',
    '127.255.255.254',
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.50',
    '169.254.169.254',
    '100.64.0.1',
    '2130706433', // integer 127.0.0.1
    '0x7f000001', // hex 127.0.0.1
    '0177.0.0.1'  // octal 127.0.0.1
  ]) {
    assert.equal(isUnsafeHostname(unsafeHost), true, `Expected ${unsafeHost} to be flagged unsafe`);
    assert.throws(
      () => assertSafeScraperUrl(`https://${unsafeHost}/test`),
      (err) => err.code === 'UNSAFE_URL',
      `Expected UNSAFE_URL for https://${unsafeHost}/test`
    );
  }

  // 3. Comprehensive IPv6 formats (Loopback, Unspecified, Hex IPv4-mapped, ULA, Link-Local, 6to4, NAT64)
  for (const ipv6Url of [
    'https://[::1]/admin',
    'https://[0:0:0:0:0:0:0:1]/admin',
    'https://[::]/admin',
    'https://[::ffff:127.0.0.1]/admin',
    'https://[::ffff:7f00:1]/admin',        // URL-normalized hex for ::ffff:127.0.0.1
    'https://[::ffff:a9fe:a9fe]/latest',    // URL-normalized hex for ::ffff:169.254.169.254
    'https://[::ffff:c0a8:101]/router',     // ::ffff:192.168.1.1
    'https://[::ffff:a00:1]/internal',      // ::ffff:10.0.0.1
    'https://[fc00::1]/ula',
    'https://[fd12:3456:789a::1]/ula',
    'https://[fe80::1]/linklocal',
    'https://[2001:db8::1]/doc',
    'https://[2002:7f00:1::1]/6to4-loopback',
    'https://[64:ff9b::7f00:1]/nat64-loopback'
  ]) {
    assert.throws(
      () => assertSafeScraperUrl(ipv6Url),
      (err) => err.code === 'UNSAFE_URL',
      `Expected IPv6 URL ${ipv6Url} to be blocked with UNSAFE_URL`
    );
  }

  // Verify public IPv4 & IPv6 are allowed
  assert.equal(isUnsafeIpAddress('93.184.216.34'), false);
  assert.equal(isUnsafeIpAddress('2606:2800:220:1:248:1893:25c8:1946'), false);
  assertSafeScraperUrl('https://[2606:2800:220:1:248:1893:25c8:1946]/');

  // 4. DNS Resolution Guard (blocking DNS rebinding to IPv4 or IPv6 private addresses)
  await assert.rejects(
    () =>
      assertSafeResolvedHost('rebind-v4.attacker.example', {
        dnsLookupImpl: async () => [{ address: '169.254.169.254', family: 4 }]
      }),
    (err) => err.code === 'UNSAFE_URL' && err.message.includes('SSRF_DNS_RESOLVED_TO_PRIVATE_IP')
  );

  await assert.rejects(
    () =>
      assertSafeResolvedHost('rebind-v6.attacker.example', {
        dnsLookupImpl: async () => [{ address: '::ffff:127.0.0.1', family: 6 }]
      }),
    (err) => err.code === 'UNSAFE_URL' && err.message.includes('SSRF_DNS_RESOLVED_TO_PRIVATE_IP')
  );

  const validResolved = await assertSafeResolvedHost('public.example.com', {
    dnsLookupImpl: async () => [{ address: '93.184.216.34', family: 4 }]
  });
  assert.deepEqual(validResolved, ['93.184.216.34']);

  // 5. Redirect Chain Validation (blocking redirect hop to private IPv6 OR redirect hop to DNS-rebound domain)
  await assert.rejects(
    () =>
      fetchSafeResponse('https://public.example.com/start', {
        maxRetries: 0,
        dnsLookupImpl: async () => [{ address: '93.184.216.34', family: 4 }],
        fetchImpl: async (url) => {
          if (url === 'https://public.example.com/start') {
            return {
              status: 302,
              ok: false,
              headers: new Map([['location', 'https://[::ffff:7f00:1]/secret']])
            };
          }
          throw new Error('Should not reach second hop');
        }
      }),
    (err) => err.code === 'UNSAFE_URL'
  );

  await assert.rejects(
    () =>
      fetchSafeResponse('https://public.example.com/hop1', {
        maxRetries: 0,
        dnsLookupImpl: async (host) => {
          if (host === 'public.example.com') return [{ address: '93.184.216.34', family: 4 }];
          if (host === 'evil-redirect.example.com') return [{ address: '10.0.0.42', family: 4 }];
          return [];
        },
        fetchImpl: async (url) => {
          if (url === 'https://public.example.com/hop1') {
            return {
              status: 301,
              ok: false,
              headers: new Map([['location', 'https://evil-redirect.example.com/internal']])
            };
          }
          throw new Error('Should never fetch DNS-rebound redirect target');
        }
      }),
    (err) => err.code === 'UNSAFE_URL' && err.message.includes('SSRF_DNS_RESOLVED_TO_PRIVATE_IP')
  );

  console.log('PASS: Centralized SSRF guard (IPv4, IPv6, Redirects, DNS resolution) passed all checks.');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
