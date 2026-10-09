import { deviceIntegrityChecksAsked } from "@/test/biometrics-double";
import {
  appSwitcherBlurIntensity,
  isScreenCaptureBlocked,
} from "@/test/harness/native-doubles";

// ⛔ One test only: a second would read the shared reset after the first, not what the launch did.
it("blocks capture, blurs the iPhone's app switcher at the default strength, and asks the phone check once, at launch", () => {
  expect(isScreenCaptureBlocked()).toBe(true);
  expect(appSwitcherBlurIntensity()).toBe(0.5);
  expect(deviceIntegrityChecksAsked()).toBe(1);
});
