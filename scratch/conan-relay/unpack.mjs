export function unpackDeanEdwards(packedHtml = '') {
  if (typeof packedHtml !== 'string' || packedHtml.length > 1024 * 1024) return '';
  const unpackedBlocks = [];
  const deadlineMs = Date.now() + 100;
  const regex = /eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/g;
  let match;

  while ((match = regex.exec(packedHtml)) !== null) {
    if (Date.now() > deadlineMs) break;
    try {
      let [_, p, aStr, cStr, kStr] = match;
      const a = parseInt(aStr, 10);
      let c = parseInt(cStr, 10);
      if (a < 2 || a > 62 || !Number.isSafeInteger(c) || c > 4096 || p.length > 100000 || kStr.length > 100000 || unpackedBlocks.length >= 20) continue;
      const k = kStr.split('|');

      const encodeBase = (num) => {
        return (num < a ? '' : encodeBase(Math.floor(num / a))) +
          ((num = num % a) > 35 ? String.fromCharCode(num + 29) : num.toString(36));
      };

      while (c--) {
        if (p.length > 1024 * 1024 || Date.now() > deadlineMs) break;
        if (k[c]) {
          const token = encodeBase(c);
          p = p.replace(new RegExp(`\\b${token}\\b`, 'g'), () => k[c]);
        }
      }
      unpackedBlocks.push(p);
    } catch (_) {}
  }
  return unpackedBlocks.join('\n');
}

