import {
  allowScreenCaptureAsync,
  preventScreenCaptureAsync,
} from "expo-screen-capture";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { reportError } from "@/shared/observability/observability";

// One key for every caller: the library lifts a block only once every key that set one is allowed.
const SCREEN_CAPTURE_KEY = "app";

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
  return preventScreenCaptureAsync(SCREEN_CAPTURE_KEY).catch(
    (error: unknown) => {
      reportError(error, { boundary: "screen_capture" });
    },
  );
}

export function allowScreenCapture() {
  return allowScreenCaptureAsync(SCREEN_CAPTURE_KEY).catch((error: unknown) => {
    reportError(error, { boundary: "screen_capture" });
  });
}
