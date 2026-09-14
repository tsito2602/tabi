import { MotionPage } from '@/components/motion-page';
import { ThemeSetting } from '@/components/theme-setting';
import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { router } from 'expo-router';
import { BrandLogo } from '@/components/brand-logo';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-provider';
import { MemberAvatar } from '@/components/member-avatar';
import { PwaControls } from '@/components/pwa';
import { useToast } from '@/components/toast';
import { useTravel } from '@/data/travel-provider';
import { type Palette } from '@/constants/design';
import packageInfo from '../../package.json';

export default function SettingsScreen() {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);

  const { user, isDemo, updateProfile, signOut, exitDemo } = useAuth();
  const { trips, selectTrip, sync, syncing, pendingCount, error: syncError } = useTravel();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? (isDemo ? 'あなた' : ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changed = name.trim() !== (user?.name ?? (isDemo ? 'あなた' : ''));
  const save = async () => {
    if (busy || !changed) return;
    setBusy(true); setError('');
    try { await updateProfile(name); setName(name.trim()); toast('表示名を保存しました'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '保存できませんでした'); }
    finally { setBusy(false); }
  };
  const logout = async () => {
    setBusy(true); setError('');
    try { if (isDemo) exitDemo(); else await signOut(); router.replace('/'); }
    catch { setError('ログアウトできませんでした'); }
    finally { setBusy(false); }
  };
  return <MotionPage><SafeAreaView style={styles.screen} edges={['top', 'bottom']}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="戻る" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.back}><Text style={{ fontSize: 32, color: palette.ocean }}>‹</Text></Pressable><Text accessibilityRole="header" style={styles.title}>設定</Text></View>
      <View style={styles.section}><Text style={styles.sectionTitle}>プロフィール</Text><View style={styles.card}>
        <View style={styles.profile}><MemberAvatar name={user?.name || (isDemo ? 'あなた' : user?.email || 'アカウント')} avatarUrl={user?.avatarUrl} size={64} /><View style={{ flex: 1, gap: 6 }}><Text style={styles.name}>{user?.name || (isDemo ? 'あなた' : 'アカウント')}</Text><Text numberOfLines={2} style={styles.meta}>{isDemo ? 'サンプルアカウント' : user?.email}</Text></View></View>
        <Text style={styles.label}>表示名</Text><TextInput accessibilityLabel="表示名" value={name} onChangeText={setName} maxLength={100} editable={!busy} autoComplete="name" returnKeyType="done" onSubmitEditing={() => void save()} style={styles.input} />
        {!isDemo ? <Text style={styles.meta}>{user?.avatarUrl ? 'アイコンはGoogleアカウントの画像を表示します。' : 'Googleの画像を反映するには、一度ログアウトして再ログインしてください。'}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {changed ? <Pressable accessibilityRole="button" disabled={busy || !name.trim()} onPress={() => void save()} style={[styles.save, (busy || !name.trim()) && { opacity: 0.45 }]}><Text style={styles.saveText}>{busy ? '保存中…' : '変更を保存'}</Text></Pressable> : null}
      </View></View>
      <View style={styles.section}><Text style={styles.sectionTitle}>表示</Text><View style={styles.card}><ThemeSetting /></View></View>
      <View style={styles.section}><Text style={styles.sectionTitle}>旅行のメンバー</Text><View style={styles.card}>
        {trips.length ? trips.map((trip) => <Pressable accessibilityRole="button" accessibilityLabel={`${trip.name}のメンバー`} key={trip.id} onPress={() => { selectTrip(trip.id); router.push({ pathname: '/trips/[tripId]/members', params: { tripId: trip.id } }); }} style={styles.row}>
          <SymbolView name={{ ios: 'person.2', android: 'group', web: 'group' }} size={22} tintColor={palette.ocean} /><View style={{ flex: 1, gap: 5 }}><Text style={styles.rowText}>{trip.name}</Text><Text style={styles.meta}>{trip.memberCount}人</Text></View><Text style={styles.chevron}>›</Text>
        </Pressable>) : <Text style={styles.meta}>旅行を作成すると、メンバーを招待できます。</Text>}
      </View></View>
      <View style={styles.section}><Text style={styles.sectionTitle}>アプリ</Text><View style={styles.card}>
        {!isDemo ? <><Pressable accessibilityRole="button" disabled={syncing} onPress={() => void sync()} style={styles.row}><SymbolView name={{ ios: 'arrow.triangle.2.circlepath', android: 'sync', web: 'sync' }} size={22} tintColor={palette.ocean} /><Text style={[styles.rowText, { flex: 1 }]}>{syncing ? '同期中…' : '最新の情報に更新'}</Text></Pressable><Text accessibilityLiveRegion="polite" style={styles.meta}>{syncError || (pendingCount ? `${pendingCount}件の変更が未同期です` : '未同期の変更はありません')}</Text></> : null}
        <PwaControls />
        {pendingCount && !isDemo ? <Text style={styles.meta}>ログアウトする前に、変更を同期してください。</Text> : null}
        <Pressable accessibilityRole="button" disabled={busy || (!isDemo && pendingCount > 0)} onPress={() => void logout()} style={[styles.row, (busy || (!isDemo && pendingCount > 0)) && { opacity: 0.45 }]}><SymbolView name={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }} size={22} tintColor={palette.slate} /><Text style={styles.rowText}>{isDemo ? 'サンプルを終了' : 'ログアウト'}</Text></Pressable>
      </View></View>
      <View style={styles.appInfo}><BrandLogo style={{ width: 48, height: 48 }} contentFit="contain" /><Text style={styles.brand}>tabi</Text><Text style={styles.meta}>バージョン {packageInfo.version}</Text></View>
    </ScrollView></KeyboardAvoidingView></SafeAreaView></MotionPage>;
}
const createStyles = (palette: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas }, content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 24, paddingBottom: 48, gap: 30 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 }, back: { width: 40, height: 48, justifyContent: 'center' }, title: { fontSize: 28, fontWeight: '700', color: palette.ink },
  section: { gap: 12 }, sectionTitle: { color: palette.slate, fontSize: 13, fontWeight: '600', paddingLeft: 4 }, card: { padding: 22, backgroundColor: palette.paper, borderRadius: 22, gap: 14 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 12 }, name: { color: palette.ink, fontSize: 20, fontWeight: '700' }, meta: { color: palette.slate, fontSize: 12, lineHeight: 19 }, label: { color: palette.slate, fontSize: 12, fontWeight: '600' },
  input: { backgroundColor: palette.canvas, color: palette.ink, padding: 14, borderRadius: 10, fontSize: 16, minHeight: 48 }, save: { backgroundColor: palette.ocean, minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, saveText: { color: palette.onOcean, fontSize: 14, fontWeight: '700' }, error: { color: palette.danger, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48, paddingVertical: 8 }, rowText: { color: palette.ink, fontSize: 14, lineHeight: 21, fontWeight: '600' }, chevron: { color: palette.smoke, fontSize: 24 }, appInfo: { alignItems: 'center', gap: 6, paddingTop: 8 }, brand: { fontSize: 20, color: palette.ink, fontWeight: '700' },
});
