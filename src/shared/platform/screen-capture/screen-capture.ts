import {
  allowScreenCaptureAsync,
  preventScreenCaptureAsync,
} from "expo-screen-capture";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { reportError } from "@/shared/observability/observability";

// One key for every caller: the library lifts a block only once every key that set one is allowed.
const SCREEN_CAPTURE_KEY = "app";
const CURRENT_WINDOW_KEY = "current-window";

// A screen error stands in for a screen without being it, so capture allowed on that screen must not reach it.
// Counted, so one leaving never clears another still showing.
const screenErrorStore = createStore(() => ({ screenErrorsShowing: 0 }));

export function markScreenErrorShowing() {
  screenErrorStore.setState(({ screenErrorsShowing }) => ({
    screenErrorsShowing: screenErrorsShowing + 1,
  }));
  return () => {
    screenErrorStore.setState(({ screenErrorsShowing }) => ({
      screenErrorsShowing: screenErrorsShowing - 1,
    }));
  };
}

export function useScreenErrorShowing() {
  return useStore(
    screenErrorStore,
    ({ screenErrorsShowing }) => screenErrorsShowing > 0,
  );
}

export function blockScreenCapture() {
  return Promise.all([
    preventScreenCaptureAsync(SCREEN_CAPTURE_KEY),
    // The library tells the phone only of a key it does not hold yet, and a recreated Android window starts unblocked:
    // setting and at once dropping this key reaches the current window, while the key above keeps the block.
    preventScreenCaptureAsync(CURRENT_WINDOW_KEY),
    allowScreenCaptureAsync(CURRENT_WINDOW_KEY),
  ]).catch((error: unknown) => {
    reportError(error, { boundary: "screen_capture" });
  });
}

export function allowScreenCapture() {
  return allowScreenCaptureAsync(SCREEN_CAPTURE_KEY).catch((error: unknown) => {
    reportError(error, { boundary: "screen_capture" });
  });
}
