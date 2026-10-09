import type { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { bankState } from "@/mocks/bank/state";
import { switcherStore } from "@/mocks/switcher/switcher-store";

export function subscribeToPhoneSidePick(
  scenarioId: TransferScenarioId,
  onChange: (picked: boolean) => void,
) {
  // Loaded first: loading restores a pick saved before a restart, and the first answer must carry it.
  bankState();
  const isPicked = (pick: ReturnType<typeof switcherStore.getState>) =>
    pick.scenarioId === scenarioId;
  onChange(isPicked(switcherStore.getState()));
  return switcherStore.subscribe((pick, previousPick) => {
    if (isPicked(pick) !== isPicked(previousPick)) onChange(isPicked(pick));
  });
}
