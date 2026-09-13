import { useEffect, type RefObject } from 'react';
import type { ScrollView } from 'react-native';
import { followFormKeyboard } from '@/utils/form-keyboard';

export function useFormKeyboard(scroll: RefObject<ScrollView | null>, visible = true) {
  useEffect(() => {
    if (!visible) return;
    return followFormKeyboard(() => scroll.current?.getScrollableNode() as HTMLElement | null);
  }, [scroll, visible]);
}
