// =====================================================================
// MA TV SUPREME 18-SOURCE SCRAPING GRID & 6 SUPERVISOR ARCHITECTURE
// =====================================================================

export const SOURCE_SUPERVISORS = Object.freeze([
  {
    id: 'supervisor-01',
    name: 'المشرف 01: ماستر الأفلام والمنوعات العامة',
    specialty: 'Movies & Global Catalog',
    sources: [
      { name: 'MyCima', url: 'https://mycima.gripe', kind: 'cinema', providerId: 'mycima' },
      { name: 'Akoam', url: 'https://akwam.ss', kind: 'cinema', providerId: 'akoam' },
      { name: 'CimaNow VIP', url: 'https://vip.cimanowinc.com', kind: 'cinema', providerId: 'cimanow' }
    ]
  },
  {
    id: 'supervisor-02',
    name: 'المشرف 02: ماستر السينما الحديثة وموفيز',
    specialty: 'Modern Cinema & Releases',
    sources: [
      { name: 'Moviz Time', url: 'https://moviz-time.quest', kind: 'cinema', providerId: 'moviz' },
      { name: 'Shahid4U CDN', url: 'https://cdn.shahid4u.asia', kind: 'cinema', providerId: 'shahid4u' },
      { name: 'Shii4U Cam', url: 'https://shii4u.cam', kind: 'cinema', providerId: 'shii4u' }
    ]
  },
  {
    id: 'supervisor-03',
    name: 'المشرف 03: ماستر إيجي ديد وشبكات الويب',
    specialty: 'EgyDead & Web Direct Networks',
    sources: [
      { name: 'EgyDead Direct', url: 'https://w1.egydead.top', kind: 'cinema', providerId: 'egydead' },
      { name: 'IPA Universe', url: 'https://watch.ipauniverse.com', kind: 'cinema', providerId: 'ipa' },
      { name: '3ck TV', url: 'https://e.3cktv.com', kind: 'turkish', providerId: '3ck' }
    ]
  },
  {
    id: 'supervisor-04',
    name: 'المشرف 04: ماستر بوابة الأنمي الحصرية',
    specialty: 'Exclusive Anime Hub',
    sources: [
      { name: 'Anime4Up Bond (Gateway)', url: 'https://4f.7grcy6t.shop', mirrorUrl: 'https://www.anime4up.bond', kind: 'anime', providerId: 'anime4up' },
      { name: 'QFilm TV', url: 'https://a.qfilm.tv', kind: 'anime', providerId: 'qfilm' },
      { name: 'RistoAnime', url: 'https://ristoanime.me', kind: 'anime', providerId: 'ristoanime' }
    ]
  },
  {
    id: 'supervisor-05',
    name: 'المشرف 05: ماستر عرب سيد وميلودي أنمي',
    specialty: 'ArabSeed & Melody Network',
    sources: [
      { name: 'Mewsry Live', url: 'https://www.mewsry.live', kind: 'cinema', providerId: 'mewsry' },
      { name: 'ArabSeed', url: 'https://www.arabseed.wine', kind: 'cinema', providerId: 'arabseed' },
      { name: 'Anime4Up Rest', url: 'https://w1.anime4up.rest', kind: 'anime', providerId: 'anime4up_rest' }
    ]
  },
  {
    id: 'supervisor-06',
    name: 'المشرف 06: ماستر ويت أنمي والبث المباشر',
    specialty: 'WitAnime & Live Sports Events',
    sources: [
      { name: 'WitAnime', url: 'https://witanime.you', kind: 'anime', providerId: 'witanime' },
      { name: 'EgyDead Live TV', url: 'https://tv10.egydead.live', kind: 'live', providerId: 'egydead_live' },
      { name: 'YallaShoot Sports Live', url: 'https://yalla-shoot.tv', kind: 'live', providerId: 'sports_live' }
    ]
  }
]);

export const ALL_SOURCES = Object.freeze(
  SOURCE_SUPERVISORS.flatMap(s => s.sources)
);

/**
 * Generate authentic client headers for edge direct stream fetching to prevent CDN hotlink blocks
 */
export function generateAntiBanHeaders(streamUrl, referer = '') {
  const headers = {
    'Accept': '*/*',
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    'Sec-Fetch-Dest': 'video',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site'
  };

  if (referer) {
    try {
      const u = new URL(referer);
      headers['Referer'] = u.origin + '/';
      headers['Origin'] = u.origin;
    } catch (_) {
      headers['Referer'] = referer;
    }
  } else if (streamUrl) {
    try {
      const u = new URL(streamUrl);
      headers['Referer'] = u.origin + '/';
      headers['Origin'] = u.origin;
    } catch (_) {}
  }

  return headers;
}
