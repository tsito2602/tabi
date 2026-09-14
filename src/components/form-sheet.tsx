import type { DetailOrigin } from '@/utils/detail-origin';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { MotionModal } from './motion-modal';
import { useThemedStyles } from '@/theme/theme-provider';
import { useModalViewport } from '@/hooks/use-modal-viewport';
import { useFormKeyboard } from '@/hooks/use-form-keyboard';
import { PropsWithChildren, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ToastHost } from './toast';
import { type Palette } from '@/constants/design';

type Props = PropsWithChildren<{
  visible: boolean;
  detailOrigin?: DetailOrigin;
  presentation?: 'form' | 'detail';
  title: string;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  canSave?: boolean;
  dirty?: boolean;
  error?: string;
}>;

export function FormSheet({ detailOrigin, presentation = 'form', visible, title, onClose, onSave, saveLabel = '保存', canSave = true, dirty = false, error, children }: Props) {
  const styles = useThemedStyles(createStyles);

  const viewport = useModalViewport(visible);
  const reduceMotion = useReducedMotion();
  const [confirmClose, setConfirmClose] = useState(false);
  const scroll = useRef<ScrollView>(null);
  useFormKeyboard(scroll, visible);
  useEffect(() => { if (error) scroll.current?.scrollToEnd({ animated: !reduceMotion }); }, [error, reduceMotion]);
  const close = () => {
    if (!dirty) return onClose();
    if (Platform.OS === 'web') {
      setConfirmClose(true);
    } else Alert.alert('変更を保存せずに閉じますか？', undefined, [
      { text: '編集を続ける', style: 'cancel' },
      { text: '変更を破棄', style: 'destructive', onPress: onClose },
    ]);
  };
  return <><MotionModal detail={presentation === 'detail'} detailOrigin={detailOrigin} onDetailDismiss={close} visible={visible} transparent={Platform.OS === 'web'} presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'} animationType={reduceMotion ? 'none' : Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={close}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} testID={presentation === 'detail' ? 'detail-modal-viewport' : 'form-modal-viewport'} style={[styles.overlay, viewport]}>
      {Platform.OS === 'web' ? <Pressable accessibilityLabel="シートを閉じる" onPress={close} style={StyleSheet.absoluteFill} /> : null}
      <SafeAreaView testID="form-sheet" edges={['top', 'bottom']} style={styles.sheet}>
        <View accessibilityViewIsModal testID="form-sheet-fill" style={styles.fill}>
          {Platform.OS === 'web' && presentation === 'detail' ? <View testID="detail-dismiss-handle" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><View /></View> : null}
          <View testID="sheet-header" style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={close} style={styles.headerButton}><Text style={styles.close}>閉じる</Text></Pressable>
            <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>{title}</Text>
            {onSave ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSave }} disabled={!canSave} onPress={onSave} style={styles.headerButton}><Text style={[styles.save, !canSave && styles.disabled]}>{saveLabel}</Text></Pressable> : <View style={styles.headerButton} />}
          </View>
          <ScrollView testID="form-sheet-scroll" ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false}>
            {children}
            {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
          </ScrollView>
        </View>
      </SafeAreaView>
      <ToastHost />
    </KeyboardAvoidingView>
  </MotionModal>
    {Platform.OS === 'web' ? <MotionModal visible={visible && confirmClose} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setConfirmClose(false)}>
      <View testID="modal-viewport" style={[styles.overlay, viewport]}>
        <View testID="discard-dialog" accessibilityViewIsModal style={styles.confirmCard}>
          <Text accessibilityRole="header" style={styles.confirmTitle}>変更を保存せずに閉じますか？</Text>
          <Text style={styles.confirmBody}>入力した内容は保存されません。</Text>
          <Pressable accessibilityRole="button" onPress={() => setConfirmClose(false)} style={styles.continueButton}><Text style={styles.continueText}>編集を続ける</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setConfirmClose(false); onClose(); }} style={styles.discardButton}><Text style={styles.discardText}>変更を破棄</Text></Pressable>
        </View>
      </View>
    </MotionModal> : null}
  </>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Platform.OS === 'web' ? 'rgba(24,42,54,0.3)' : palette.canvas, padding: Platform.OS === 'web' ? 16 : 0 },
  sheet: { width: '100%', flex: 1, maxWidth: 640, maxHeight: Platform.OS === 'web' ? '92%' : '100%', backgroundColor: palette.canvas, borderRadius: Platform.OS === 'web' ? 24 : 0, overflow: 'hidden' },
  fill: { flex: 1 },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.ash },
  headerButton: { minWidth: 64, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  close: { fontSize: 15, color: palette.slate },
  save: { fontSize: 16, fontWeight: '700', color: palette.ocean },
  disabled: { opacity: 0.35 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 24, color: palette.ink, fontWeight: '700' },
  content: { padding: 24, paddingBottom: 40, gap: 12 },
  error: { padding: 14, borderRadius: 8, color: palette.danger, fontSize: 14, lineHeight: 21, backgroundColor: palette.paper },
  confirmCard: { width: '100%', maxWidth: 360, padding: 24, borderRadius: 20, backgroundColor: palette.paper, gap: 12 },
  confirmTitle: { color: palette.ink, fontSize: 18, lineHeight: 27, fontWeight: '700' },
  confirmBody: { color: palette.slate, fontSize: 14, lineHeight: 22, marginBottom: 8 },
  continueButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: palette.ocean },
  continueText: { color: palette.onOcean, fontSize: 15, fontWeight: '700' },
  discardButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  discardText: { color: palette.danger, fontSize: 15 },
});
