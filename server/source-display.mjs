// Presentation only: always pass the original registry name, never a display name.
export function sourceDisplayName(original) {
  const name = String(original ?? '').trim();
  const chars = Array.from(name);
  if (!chars.length) return '';
  const firstLetter = chars.find(char => /\p{Letter}/u.test(char)) || chars[0];
  const prefix = /\p{Script=Arabic}/u.test(firstLetter) ? 'ذ' : 'th';
  return prefix + chars.slice(1).join('');
}

