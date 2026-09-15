import { Alert } from 'react-native';

export function confirmDeletion(title: string, message: string, onConfirm: () => void) {
  Alert.alert(title, message, [
    { text: 'キャンセル', style: 'cancel' },
    { text: '削除', style: 'destructive', onPress: onConfirm },
  ]);
}
