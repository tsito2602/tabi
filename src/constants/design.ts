import { Platform } from 'react-native';

export const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

// Neutral surfaces are shared with konogoro; blue identifies an action, not a page.
export const lightPalette = {
  ink: '#242424', ocean: '#496B80', onOcean: '#FFFFFF',
  paper: '#FFFFFF', canvas: '#F7F7F5', mist: '#EFEFEC', soft: '#F3F3F0',
  ash: '#DDDDD7', smoke: '#62625F', slate: '#555552', placeholder: '#62625F',
  sky: '#E8EEF2', accent: '#496B80',
  danger: '#B42318', warning: '#885326',
  success: '#E5EFE8', successSurface: '#F3F3F0',
  glass: 'rgba(247,247,245,0.88)', glassNative: 'rgba(247,247,245,0.96)',
  overlay: 'rgba(0,0,0,0.32)',
} as const;
export type Palette = { [K in keyof typeof lightPalette]: string };
export const darkPalette: Palette = {
  ink: '#F5F5F3', ocean: '#A1BDCC', onOcean: '#141416',
  paper: '#202023', canvas: '#141416', mist: '#2B2B2F', soft: '#252528',
  ash: '#3B3B40', smoke: '#B8B8B2', slate: '#C6C6C0', placeholder: '#A3A39E',
  sky: '#28343B', accent: '#A1BDCC',
  danger: '#FF6961', warning: '#DFB184',
  success: '#28382E', successSurface: '#252528',
  glass: 'rgba(20,20,22,0.9)', glassNative: 'rgba(20,20,22,0.97)',
  overlay: 'rgba(0,0,0,0.56)',
};

export const radii = { button: 12, card: 16, tag: 8, nav: 12, dialog: 20, trip: 24 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, page: 20 } as const;
export const typeScale = { title: 24, card: 17, body: 15, meta: 12 } as const;
