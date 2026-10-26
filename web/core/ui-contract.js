// Shared product contract for web, handheld, desktop and television shells.
export const UI_CONTRACT = Object.freeze({
  name: 'T-A-TV',
  direction: 'rtl',
  navigationSide: 'right',
  desktopBreakpoint: 900,
  topBar: false,
  bottomNavigation: false,
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
  theme: Object.freeze({ background: '#07090b', surface: '#0d1117', elevated: '#121824', gold: '#e8bd75', goldLight: '#f7d594', goldDark: '#b88b3e', text: '#ffffff', textSecondary: '#94a3b8' }),
});

export function resolveNavigationTab(value) {
  const id = UI_CONTRACT.aliases[value] || value;
  return UI_CONTRACT.navigation.some(item => item.id === id) ? id : 'home';
}
