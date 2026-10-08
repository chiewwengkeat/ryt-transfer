import { useIsFocused } from "expo-router";
import { createContext, use } from "react";

// True while a view covers every screen: the one on top of the stack still counts as focused beneath it.
export const ScreensCoveredContext = createContext(false);

export function useIsScreenOnTop() {
  const screenFocused = useIsFocused();
  return screenFocused && !use(ScreensCoveredContext);
}
