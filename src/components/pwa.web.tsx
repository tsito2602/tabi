import { MotionPresence } from '@/components/motion-presence';
import { SymbolView } from 'expo-symbols';
import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FormSheet } from './form-sheet';
import { type Palette } from '@/constants/design';
import { useTravel } from '@/data/travel-provider';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let promptEvent: InstallEvent | null = null;
export function PwaSetup() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => undefined);
    const beforeInstall = (event: Event) => { event.preventDefault(); promptEvent = event as InstallEvent; };
    const update = () => { if (document.visibilityState === 'visible') void navigator.serviceWorker.getRegistration().then((registration) => registration?.update()).catch(() => undefined); };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    document.addEventListener('visibilitychange', update);
    return () => { window.removeEventListener('beforeinstallprompt', beforeInstall); document.removeEventListener('visibilitychange', update); };
  }, []);
  return null;
}
export function PwaControls() {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);

  const { pendingCount } = useTravel();
  const [guide, setGuide] = useState(false);
  const [standalone, setStandalone] = useState(true);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const media = matchMedia('(display-mode: standalone)');
    const checkDisplay = () => setStandalone(media.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    checkDisplay(); media.addEventListener('change', checkDisplay);
    let live = true;
    const checkUpdate = () => { if ('serviceWorker' in navigator) void navigator.serviceWorker.getRegistration().then((registration) => { if (live) setWaiting(registration?.waiting ?? null); }); };
    checkUpdate(); const timer = setInterval(checkUpdate, 5000);
    return () => { live = false; clearInterval(timer); media.removeEventListener('change', checkDisplay); };
  }, []);
  const install = async () => {
    if (!promptEvent) return setGuide(true);
    try { await promptEvent.prompt(); if ((await promptEvent.userChoice).outcome === 'accepted') setStandalone(true); promptEvent = null; }
    catch { setGuide(true); }
  };
  const update = () => {
    if (pendingCount) return setMessage('未同期の変更を送信してから更新できます');
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
    waiting?.postMessage({ type: 'ACTIVATE_UPDATE' });
  };
  return <>
    {!standalone || waiting ? <View style={styles.row}>{!standalone ? <Pressable onPress={() => void install()} style={styles.button}><SymbolView name={{ ios: 'plus.app', android: 'add_to_home_screen', web: 'add_to_home_screen' }} size={18} tintColor={palette.ocean} /><Text style={styles.text}>ホーム画面に追加</Text></Pressable> : null}{waiting ? <Pressable onPress={update} style={styles.button}><Text style={styles.text}>新しいバージョンに更新 ↻</Text></Pressable> : null}</View> : null}
    {message ? <Text style={styles.text}>{message}</Text> : null}
    <MotionPresence>{guide ? <FormSheet visible title="ホーム画面に追加" onClose={() => setGuide(false)}><Text style={styles.guideTitle}>いつものアプリと同じように。</Text><Text style={styles.guideText}>{/iPhone|iPad|iPod/.test(navigator.userAgent) ? 'Safariの共有メニューから「ホーム画面に追加」を選び、「追加」をタップしてください。' : 'ブラウザーのメニューから「アプリをインストール」または「ホーム画面に追加」を選んでください。'}</Text><Text style={styles.guideText}>旅行のしおりから「オフライン保存」をすると、保存した書類も圏外で開けます。</Text></FormSheet> : null}</MotionPresence>
  </>;
}
const createStyles = (palette: Palette) => StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }, button: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: palette.sky, borderRadius: 10 }, text: { color: palette.ocean, fontSize: 12, fontWeight: '600' }, guideTitle: { color: palette.ink, fontSize: 22, fontWeight: '700', marginTop: 12 }, guideText: { color: palette.slate, fontSize: 15, lineHeight: 26 } });
