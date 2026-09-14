import { MotionModal } from './motion-modal';
import { useThemedStyles } from '@/theme/theme-provider';
import { useModalViewport } from '@/hooks/use-modal-viewport';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Palette } from '@/constants/design';

export function ConfirmationDialog({ visible, name, title, description, confirmLabel, busy, error, onCancel, onConfirm }: {
  title: string;
  description: string;
  confirmLabel: string;
  visible: boolean;
  name: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const styles = useThemedStyles(createStyles);

  const viewport = useModalViewport(visible);
  const cancel = () => { if (!busy) onCancel(); };
  return <MotionModal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
    <View testID="modal-viewport" style={[styles.overlay, viewport]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={cancel} accessibilityLabel="削除をキャンセル" />
      <View testID="delete-trip-dialog" accessibilityViewIsModal style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        {name ? <Text numberOfLines={3} style={styles.tripName}>{name}</Text> : null}
        <Text style={styles.body}>{description}</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={cancel} style={[styles.button, styles.cancel, busy && styles.disabled]}><Text style={styles.cancelText}>キャンセル</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={onConfirm} style={[styles.button, styles.delete, busy && styles.disabled]}><Text style={styles.deleteText}>{busy ? '処理中…' : confirmLabel}</Text></Pressable>
        </View>
      </View>
    </View>
  </MotionModal>;
}

export function DeleteTripDialog(props: Omit<Parameters<typeof ConfirmationDialog>[0], 'title' | 'description' | 'confirmLabel'>) {
  return <ConfirmationDialog {...props} title="この旅行を削除しますか？" description="共有相手の画面からも、しおり・予約・書類・行きたい場所・準備が削除されます。この操作は元に戻せません。" confirmLabel="旅行を削除" />;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(18,35,45,0.48)' },
  card: { width: '100%', maxWidth: 400, borderRadius: 24, padding: 24, gap: 14, backgroundColor: palette.paper },
  eyebrow: { color: palette.danger, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  title: { color: palette.ink, fontSize: 21, lineHeight: 30, fontWeight: '800' },
  tripName: { color: palette.ink, fontSize: 15, lineHeight: 22, fontWeight: '600', padding: 14, borderRadius: 12, backgroundColor: palette.canvas },
  body: { color: palette.slate, fontSize: 13, lineHeight: 22 },
  error: { color: palette.danger, fontSize: 13, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  button: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: palette.canvas },
  delete: { backgroundColor: palette.danger },
  cancelText: { color: palette.slate, fontSize: 14, fontWeight: '600' },
  deleteText: { color: palette.onOcean, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
