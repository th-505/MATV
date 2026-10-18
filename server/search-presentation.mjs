// Search presentation never changes an original provider query or work reference.
function normalized(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase()
    .replace(/[أإآٱ]/gu, 'ا').replace(/ى/gu, 'ي')
    .replace(/[\p{Mark}ـ]/gu, '').replace(/[^\p{Letter}\p{Number}]+/gu, ' ').trim();
}

export function presentSearchResults(rows, query) {
  const tokens = normalized(query).split(' ').filter(Boolean);
  if (!tokens.length) return [];
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).filter(item => {
    if (!item || !String(item.ref || item.id || '').trim()) return false;
    const titles = [item.title, item.original_title, item.originalTitle, item.tmdb_title];
    if (!titles.some(title => {
      const text = normalized(title);
      return text && tokens.every(token => text.includes(token));
    })) return false;
    const key = `${item.providerId || item.source || ''}\u0000${item.ref || item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
