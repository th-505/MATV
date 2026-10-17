import fs from 'fs';

const sups = [
  'supervisor1-mycima.mjs',
  'supervisor2-shahid-moviz.mjs',
  'supervisor3-egydead-ipa.mjs',
  'supervisor4-anime4up.mjs',
  'supervisor5-arabseed.mjs',
  'supervisor6-witanime-live.mjs'
];

for (const s of sups) {
  const code = fs.readFileSync('server/scrapers/' + s, 'utf8');
  const hasCheerio = code.includes('cheerio') || code.includes('load(') || code.includes('$(');
  console.log(s, 'has HTML selectors/cheerio:', hasCheerio);
}
