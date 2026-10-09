import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { subscribeToPhoneSidePick } from "@/mocks/switcher/phone-side-picks";

export function subscribeToBiometricsOff(
  onChange: (biometricsOff: boolean) => void,
) {
  return subscribeToPhoneSidePick(
    TransferScenarioId.BiometricsUnavailable,
    onChange,
  );
}
