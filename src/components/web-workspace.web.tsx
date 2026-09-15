import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { MemberAvatar } from './member-avatar';
import { type ComponentProps, type PropsWithChildren, useEffect } from 'react';
import { closeTripTransition } from '@/utils/trip-transition';
import { Link, router, usePathname } from 'expo-router';
import { BrandLogo } from '@/components/brand-logo';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/auth/auth-provider';
import { useTravel } from '@/data/travel-provider';
import { type Palette } from '@/constants/design';
import { useDesktop } from '@/hooks/use-desktop';
import { tripNavigation } from './trip-navigation';

export function WebWorkspace({ children }: PropsWithChildren) {
  const palette = usePalette(), styles = useThemedStyles(createStyles);
  const desktop = useDesktop(), pathname = usePathname();
  const { selectedTrip, syncing, sync } = useTravel(), { user, isDemo } = useAuth();
  const trip = pathname.startsWith('/trips/') ? selectedTrip : null;
  const goHome: NonNullable<ComponentProps<typeof Link>['onPress']> = event => {
    const click = event.nativeEvent as unknown as MouseEvent;
    if (!trip || event.defaultPrevented || click.button > 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return;
    event.preventDefault(); closeTripTransition(trip.id, () => router.replace('/'));
  };
  useEffect(() => {
    const preventFileNavigation = (event: DragEvent) => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); };
    const pressSpace = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.key !== ' ' || !(target instanceof HTMLElement) || !target.matches('[role="checkbox"], [role="radio"], [role="tab"]') || ['INPUT', 'BUTTON'].includes(target.tagName)) return;
      event.preventDefault();
      if (!event.repeat && target.getAttribute('aria-disabled') !== 'true' && !target.hasAttribute('disabled')) target.click();
    };
    window.addEventListener('keydown', pressSpace); window.addEventListener('dragover', preventFileNavigation); window.addEventListener('drop', preventFileNavigation);
    return () => { window.removeEventListener('keydown', pressSpace); window.removeEventListener('dragover', preventFileNavigation); window.removeEventListener('drop', preventFileNavigation); };
  }, []);
  return <View testID="web-workspace" style={styles.workspace}>
    {desktop ? <a href="#workspace-main" className="skip-link">本文へ移動</a> : null}
    {desktop ? <View role="navigation" accessibilityLabel="メインナビゲーション" style={styles.sidebar}>
      <Link href="/" onPress={goHome} style={styles.brand} accessibilityLabel="tabi 旅行一覧"><BrandLogo style={{ width: 42, height: 42 }} contentFit="contain" /><Text style={styles.wordmark}>tabi</Text></Link>
      <Link href="/" onPress={goHome} style={[styles.nav, pathname === '/' && styles.selected]}><SymbolView name={{ web: 'luggage' }} size={20} tintColor={pathname === '/' ? palette.ocean : palette.smoke} /><Text style={styles.navText}>すべての旅行</Text></Link>
      {trip ? <View style={styles.section}><View style={styles.links}>{tripNavigation.map(page => {
        const selected = pathname.endsWith(`/${page.key}`);
        return <Link key={page.key} accessibilityLabel={page.accessibilityLabel ?? page.label} href={{ pathname: `/trips/[tripId]/${page.key}`, params: { tripId: trip.id } }} style={[styles.nav, selected && styles.selected]} aria-current={selected ? 'page' : undefined}><SymbolView name={{ web: page.icon }} size={20} tintColor={selected ? palette.ocean : palette.smoke} /><Text style={[styles.navText, selected && { color: palette.ocean, fontWeight: '700' }]}>{page.label}</Text></Link>;
      })}<Link href={{ pathname: '/trips/[tripId]/members', params: { tripId: trip.id } }} style={[styles.nav, pathname.endsWith('/members') && styles.selected]} aria-current={pathname.endsWith('/members') ? 'page' : undefined}><SymbolView name={{ web: 'group' }} size={20} tintColor={palette.smoke} /><Text style={styles.navText}>メンバー</Text></Link></View></View> : null}
      <View style={{ flex: 1 }} /><View style={styles.account}>
        <Link href="/settings" style={[styles.nav, pathname === '/settings' && styles.selected]}><MemberAvatar name={user?.name || 'あなた'} avatarUrl={user?.avatarUrl} size={32} /><View style={{ flex: 1, gap: 4 }}><Text numberOfLines={1} style={{ color: palette.ink, fontSize: 13, fontWeight: '600' }}>{user?.name || (isDemo ? 'サンプルの旅行' : 'アカウント')}</Text><Text style={styles.accountText}>設定</Text></View></Link>
        {!isDemo ? <Pressable accessibilityRole="button" disabled={syncing} onPress={() => void sync()} style={styles.accountAction}><Text style={styles.accountText}>{syncing ? '同期中…' : '最新の情報に更新'}</Text></Pressable> : null}
      </View>
    </View> : null}
    <View nativeID="workspace-main" role="main" style={styles.main}>{children}</View>
  </View>;
}
const createStyles = (p: Palette) => StyleSheet.create({
  workspace: { flex: 1, flexDirection: 'row', backgroundColor: p.canvas },
  sidebar: { width: 216, flexShrink: 0, paddingHorizontal: 16, paddingTop: 24, backgroundColor: p.paper, borderRightWidth: 1, borderColor: p.ash },
  brand: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 28, paddingHorizontal: 8, textDecorationLine: 'none' }, wordmark: { color: p.ink, fontSize: 26, fontWeight: '600', letterSpacing: -.5 },
  nav: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, textDecorationLine: 'none' },
  navText: { color: p.ink, fontSize: 14, fontWeight: '500' }, selected: { backgroundColor: p.sky },
  section: { marginTop: 24 }, links: { gap: 4 }, account: { paddingVertical: 18, borderTopWidth: 1, borderColor: p.ash, marginTop: 16 },
  accountAction: { minHeight: 44, justifyContent: 'center', padding: 10, borderRadius: 12 }, accountText: { color: p.smoke, fontSize: 12 }, main: { flex: 1, minWidth: 0 },
});
