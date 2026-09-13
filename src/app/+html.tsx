import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';
export default function Root({ children }: PropsWithChildren) {
  return <html lang="ja" suppressHydrationWarning><head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#EEF2F4" />
    <script dangerouslySetInnerHTML={{ __html: `(function(){try{var p=localStorage.getItem('tabi.theme');var d=p==='dark'||(p!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.style.colorScheme=d?'dark':'light';document.querySelector('meta[name="theme-color"]').content=d?'#10191F':'#EEF2F4';}catch(e){}})();` }} />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="tabi" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/apple-touch-icon-v2.png" sizes="180x180" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <ScrollViewStyleReset />
  </head><body>{children}</body></html>;
}
