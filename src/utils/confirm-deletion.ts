import { Alert } from 'react-native';

export function confirmDeletion(title: string, message: string, onConfirm: () => void): void;
export function confirmDeletion(title: string, onConfirm: () => void): void;
export function confirmDeletion(title: string, messageOrConfirm: string | (() => void), onConfirm?: () => void) {
  const message = typeof messageOrConfirm === 'string' ? messageOrConfirm : `${title}を削除しますか？`;
  const confirm = typeof messageOrConfirm === 'function' ? messageOrConfirm : onConfirm;
  if (!confirm) return;
  Alert.alert(title, message, [
    { text: 'キャンセル', style: 'cancel' },
    { text: '削除', style: 'destructive', onPress: confirm },
  ]);
}
