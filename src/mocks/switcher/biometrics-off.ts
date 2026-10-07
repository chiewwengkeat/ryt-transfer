import { bankState } from "@/mocks/bank/state";
import { switcherStore } from "@/mocks/switcher/switcher-store";

export function subscribeToBiometricsOff(
  onChange: (biometricsOff: boolean) => void,
) {
  // Loaded first: loading restores a pick saved before a restart, and the first answer must carry it.
  bankState();
  const isBiometricsOff = ({
    scenarioId,
  }: ReturnType<typeof switcherStore.getState>) =>
    scenarioId === "transfer.biometrics_unavailable";
  onChange(isBiometricsOff(switcherStore.getState()));
  return switcherStore.subscribe((pick, previousPick) => {
    if (isBiometricsOff(pick) !== isBiometricsOff(previousPick))
      onChange(isBiometricsOff(pick));
  });
}
