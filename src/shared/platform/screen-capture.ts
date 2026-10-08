import {
  allowScreenCaptureAsync,
  preventScreenCaptureAsync,
} from "expo-screen-capture";

import { reportError } from "@/shared/observability/observability";

// One key for every caller: the library lifts a block only once every key that set one is allowed.
const SCREEN_CAPTURE_KEY = "app";

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
