// Shared product contract for web, handheld, desktop and television shells.
export const UI_CONTRACT = Object.freeze({
  name: 'نجد — Najd TV',
  direction: 'rtl',
  navigationSide: 'right',
  desktopBreakpoint: 900,
  topBar: true,
  bottomNavigation: true,
  advancedSearchLabel: 'بحث متقدم — استكشاف',
  aliases: Object.freeze({ explore: 'search' }),
  navigation: Object.freeze([
    { id: 'home', label: 'الرئيسية', icon: '⌂' },
    { id: 'movies', label: 'أفلام', icon: '▣' },
    { id: 'series', label: 'مسلسلات', icon: '▤' },
    { id: 'anime', label: 'أنمي', icon: '✦' },
    { id: 'turkish', label: 'تركي', icon: '☾' },
    { id: 'search', label: 'البحث', icon: '⌕' },
    { id: 'live', label: 'البث المباشر', icon: '◉' },
    { id: 'favorites', label: 'المفضلة', icon: '♡' },
    { id: 'settings', label: 'الإعدادات', icon: '⚙' },
  ].map(item => Object.freeze(item))),
  theme: Object.freeze({ background: '#08080e', surface: '#14131f', elevated: '#201d30', gold: '#8280ff', goldLight: '#b4b2ff', goldDark: '#4d4c9a', text: '#f8f7ff', textSecondary: '#bcb8cf' }),
});

export function resolveNavigationTab(value) {
  const id = UI_CONTRACT.aliases[value] || value;
  return UI_CONTRACT.navigation.some(item => item.id === id) ? id : 'home';
}
