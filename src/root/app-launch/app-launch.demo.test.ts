import "@/test/demo-build";
import { checkDeviceIntegrity } from "@/shared/platform/device-integrity";
import { blockScreenCapture } from "@/shared/platform/screen-capture";
import { deviceIntegrityChecksAsked } from "@/test/biometrics-double";
import {
  appSwitcherBlurIntensity,
  isScreenCaptureBlocked,
} from "@/test/harness/native-doubles";

// ⛔ One test only: a second would read the shared reset after the first, not what the launch did.
it("leaves capture allowed and the phone unchecked at a demo build's launch, and still blurs the iPhone's app switcher", async () => {
  const blockedAtLaunch = isScreenCaptureBlocked();
  const checksAskedAtLaunch = deviceIntegrityChecksAsked();

  await blockScreenCapture();
  await checkDeviceIntegrity();

  expect(blockedAtLaunch).toBe(false);
  expect(isScreenCaptureBlocked()).toBe(true);
  expect(checksAskedAtLaunch).toBe(0);
  expect(deviceIntegrityChecksAsked()).toBe(1);
  expect(appSwitcherBlurIntensity()).toBe(0.5);
});
