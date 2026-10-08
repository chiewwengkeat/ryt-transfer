import { subscribeToPhoneSidePick } from "@/mocks/switcher/phone-side-picks";

export function subscribeToBiometricsOff(
  onChange: (biometricsOff: boolean) => void,
) {
  return subscribeToPhoneSidePick("transfer.biometrics_unavailable", onChange);
}
