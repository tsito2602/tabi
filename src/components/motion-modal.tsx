import { Modal, ModalProps } from 'react-native';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
export function MotionModal({ motion: _motion, ...props }: ModalProps & { motion?: 'modal' | 'dropdown' }) {
  const reduced = useReducedMotion();
  return <Modal {...props} animationType={reduced ? 'none' : props.animationType} />;
}
