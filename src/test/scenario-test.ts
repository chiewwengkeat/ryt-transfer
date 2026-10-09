import type { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { pickTransferScenario } from "@/mocks/bank/bank";

// Callers pass the id as a literal: the matrix test finds each scenario's tests by reading it.
export function scenarioTest(
  scenarioId: `${TransferScenarioId}`,
  run: () => Promise<void>,
) {
  return async () => {
    pickTransferScenario(scenarioId);
    await run();
  };
}
