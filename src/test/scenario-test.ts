import {
  handlersForActiveScenario,
  pickTransferScenario,
} from "@/mocks/demo-bank";
import type { TransferScenarioId } from "@/mocks/scenarios/transfer-scenarios";

import { mswServer } from "./msw-server";

// Callers pass the id as a literal: the matrix test finds each scenario's tests by reading it.
export function scenarioTest(
  scenarioId: TransferScenarioId,
  run: () => Promise<void>,
) {
  return async () => {
    pickTransferScenario(scenarioId);
    mswServer.use(...handlersForActiveScenario());
    await run();
  };
}
