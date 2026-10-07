import { createStore } from "zustand/vanilla";

import type { TransferScenarioId } from "@/mocks/scenarios/transfer-scenarios";

export const NO_SCENARIO_PICK = { scenarioId: null, activatedAtMs: 0 };

export const switcherStore = createStore<{
  scenarioId: TransferScenarioId | null;
  activatedAtMs: number;
}>()(() => NO_SCENARIO_PICK);
