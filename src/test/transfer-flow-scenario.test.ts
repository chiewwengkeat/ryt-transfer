import { TRANSFER_SCENARIOS } from "@/mocks/scenarios/transfer-scenarios";
import { TransferFlowScenario } from "@/screens/transfer/state/transfer-flow";

it("names in each flow notice a scenario the registry holds", () => {
  expect(
    Object.values(TransferFlowScenario).filter(
      (scenarioId) => !Object.hasOwn(TRANSFER_SCENARIOS, scenarioId),
    ),
  ).toEqual([]);
});
