import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';
export default function Root({ children }: PropsWithChildren) {
  return <html lang="ja" suppressHydrationWarning><head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#F7F7F5" />
    <style dangerouslySetInnerHTML={{ __html: 'html{background:#F7F7F5}html[data-theme=dark]{background:#141416}' }} />
    <script dangerouslySetInnerHTML={{ __html: `(function(){try{var p=localStorage.getItem('tabi.theme');var d=p==='dark'||(p!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.style.colorScheme=d?'dark':'light';document.querySelector('meta[name="theme-color"]').content=d?'#141416':'#F7F7F5';}catch(e){}})();` }} />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="tabi" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon-transparent.png" />
    <link rel="icon" href="/icons/favicon.ico" sizes="any" />
    <link rel="icon" href="/icons/favicon-32x32.png" type="image/png" sizes="32x32" />
    <link rel="icon" href="/icons/favicon-16x16.png" type="image/png" sizes="16x16" />
    <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" sizes="any" />
    <ScrollViewStyleReset />
  </head><body>{children}</body></html>;
}
