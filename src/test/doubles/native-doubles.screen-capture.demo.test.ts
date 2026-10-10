import "@/test/setup/demo-build";
import { blockScreenCapture } from "@/shared/platform/screen-capture/screen-capture";

import { isScreenCaptureBlocked } from "./native-doubles";

// ⛔ Keep these two alone in this file, in this order: the first sees the app's own launch, the second
// what the first leaves behind.
it("starts the first test allowed by a demo build's launch, and ends it blocked", async () => {
  const blockedAtLaunch = isScreenCaptureBlocked();

  await blockScreenCapture();

  expect(blockedAtLaunch).toBe(false);
  expect(isScreenCaptureBlocked()).toBe(true);
});

it("starts the next test allowed too, as a demo build's launch leaves it", () => {
  expect(isScreenCaptureBlocked()).toBe(false);
});
