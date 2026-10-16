// =====================================================================
// MA TV ANTI-BAN NETWORK CLIENT & REAL BROWSER PROFILES
// =====================================================================

import http from 'node:http';
import https from 'node:https';

export const BROWSER_USER_AGENTS = Object.freeze([
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.113 Mobile Safari/537.36'
]);

export function getRandomUserAgent() {
  return BROWSER_USER_AGENTS[Math.floor(Math.random() * BROWSER_USER_AGENTS.length)];
}

export function buildAntiBanHeaders(targetUrl, referer = '') {
  let origin = '';
  try {
    const u = new URL(targetUrl);
    origin = u.origin;
  } catch (_) {}

  const refUrl = referer || (origin ? origin + '/' : '');

  return {
    'User-Agent': BROWSER_USER_AGENTS[0],
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': refUrl,
    ...(origin ? { 'Origin': origin } : {}),
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  };
}

export async function fetchHtmlWithAntiBan(targetUrl, { referer = '', timeoutMs = 15000, cookies = '' } = {}) {
  const headers = buildAntiBanHeaders(targetUrl, referer);
  if (cookies) {
    headers['Cookie'] = cookies;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
      redirect: 'follow'
    });

    if (!res.ok) {
      throw new Error(`HTTP_${res.status}_FETCHING_${targetUrl}`);
    }

    const html = await res.text();
    return {
      status: res.status,
      html,
      url: res.url,
      headers: res.headers
    };
  } finally {
    clearTimeout(timer);
  }
}
