import type { GestureResponderEvent } from 'react-native';
import { createContext, Dispatch, SetStateAction } from 'react';
export type PageAction = { label: string; run: (event: GestureResponderEvent) => void };
export const PageActionContext = createContext<{ action: PageAction | null; setAction: Dispatch<SetStateAction<PageAction | null>> }>({ action: null, setAction: () => undefined });
