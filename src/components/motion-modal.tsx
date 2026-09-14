import type { DetailOrigin } from '@/utils/detail-origin';
import { Modal, ModalProps } from 'react-native';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
export function MotionModal({ motion: _motion, detail: _detail, detailOrigin: _detailOrigin, onDetailDismiss: _onDetailDismiss, ...props }: ModalProps & { motion?: 'modal' | 'dropdown'; detail?: boolean; detailOrigin?: DetailOrigin; onDetailDismiss?: () => void }) {
  const reduced = useReducedMotion();
  return <Modal {...props} animationType={reduced ? 'none' : props.animationType} />;
}
