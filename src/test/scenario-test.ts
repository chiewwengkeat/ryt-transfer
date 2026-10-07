import { pickTransferScenario } from "@/mocks/demo-bank";
import type { TransferScenarioId } from "@/mocks/scenarios/transfer-scenarios";

// Callers pass the id as a literal: the matrix test finds each scenario's tests by reading it.
export function scenarioTest(
  scenarioId: TransferScenarioId,
  run: () => Promise<void>,
) {
  return async () => {
    pickTransferScenario(scenarioId);
    await run();
  };
}
