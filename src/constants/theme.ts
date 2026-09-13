import '@/global.css';

import { Platform } from 'react-native';

export const Palette = {
  ink: '#172A29',
  paper: '#F4F3ED',
  white: '#FFFEFA',
  coral: '#FF6B4A',
  coralDark: '#D84B30',
  sky: '#A8DEEF',
  skySoft: '#E2F3F7',
  sun: '#FFD875',
  mist: '#DDE2DC',
  muted: '#6D7773',
  line: '#D8DAD3',
} as const;

export const Colors = {
  light: {
    text: Palette.ink,
    background: Palette.paper,
    backgroundElement: Palette.white,
    backgroundSelected: Palette.skySoft,
    textSecondary: Palette.muted,
  },
  dark: {
    text: '#F8F7F2',
    background: '#12201F',
    backgroundElement: '#21312F',
    backgroundSelected: '#314542',
    textSecondary: '#B7C1BD',
  },
} as const;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: { sans: 'var(--font-display)', serif: 'serif', rounded: 'var(--font-rounded)', mono: 'monospace' },
});

export const Spacing = { half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 64 } as const;
export const MaxContentWidth = 920;
