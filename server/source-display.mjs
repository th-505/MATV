// Presentation only. Input must always be the original registry name.
function transformName(original) {
  const chars = Array.from(original.trim());
  if (!chars.length) return '';
  return 'ذ' + chars.slice(1).join('');
}

// Registry names may contain an Arabic name and parenthesized English aliases.
// Split only display metadata, never IDs, references, domains or arbitrary text.
export function sourceDisplayNames(original) {
  const name = String(original ?? '').trim();
  const match = name.match(/^([^()]+?)\s*\(([^()]+)\)\s*$/u);
  const primary = transformName(match ? match[1] : name);
  const alternatives = match ? match[2].split('/').map(transformName).filter(Boolean) : [];
  return { primary, alternatives };
}

export function sourceDisplayName(original) {
  const { primary, alternatives } = sourceDisplayNames(original);
  return alternatives.length ? `${primary} (${alternatives.join(' / ')})` : primary;
}
