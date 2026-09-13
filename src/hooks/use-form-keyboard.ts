import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';

// Native ScrollView and KeyboardAvoidingView manage keyboard visibility.
export function useFormKeyboard(_scroll: RefObject<ScrollView | null>, _visible = true) {}
