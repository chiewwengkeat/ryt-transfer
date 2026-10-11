import type { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { createStore } from "zustand/vanilla";

export const NO_SCENARIO_PICK = { scenarioId: null, activatedAtMs: 0 };

export const switcherStore = createStore<{
  scenarioId: `${TransferScenarioId}` | null;
  activatedAtMs: number;
}>()(() => NO_SCENARIO_PICK);
