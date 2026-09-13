import { useThemedStyles } from '@/theme/theme-provider';
import { FileDrop, type DroppedFile } from './file-drop';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Palette } from '@/constants/design';
import { TripCover } from './trip-cover';

export function CoverPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const styles = useThemedStyles(createStyles);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const select = async (file?: DroppedFile) => {
    if (!file) return;
    setBusy(true); setError('');
    let url = '';

    try {
      if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選択してください');
      if (file.size > 30 * 1024 * 1024) throw new Error('30MB以下の画像を選択してください');
      url = URL.createObjectURL(new Blob([await file.arrayBuffer()], { type: file.type }));
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
      canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext('2d'); if (!context) throw new Error('画像を読み込めませんでした');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let quality = 0.84, result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > 500000 && quality > 0.24) { quality -= 0.1; result = canvas.toDataURL('image/jpeg', quality); }
      if (result.length > 550000) throw new Error('小さい画像を選び直してください');
      onChange(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '画像を読み込めませんでした。JPEG・PNGでお試しください'); }
    finally { URL.revokeObjectURL(url); setBusy(false); }
  };
  return <View style={{ gap: 10 }}>
    <FileDrop label={value ? '画像をドロップして変更' : 'カバー画像をドロップ'} selectLabel={value ? 'カバー画像を変更' : 'カバー画像を選択'} hint="画像1枚・30MBまで" accept="image/*" disabled={busy} onFiles={(files) => select(files[0])}>
      <TripCover image={value} />
    </FileDrop>
    {value ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => onChange('')} style={styles.button}><Text style={styles.remove}>画像を解除</Text></Pressable> : null}
    {error ? <Text style={styles.remove}>{error}</Text> : null}
  </View>;
}
const createStyles = (palette: Palette) => StyleSheet.create({ actions: { flexDirection: 'row', gap: 12 }, button: { minHeight: 40, justifyContent: 'center' }, text: { color: palette.ocean, fontWeight: '700', fontSize: 14 }, remove: { color: palette.danger, fontSize: 13 } });
