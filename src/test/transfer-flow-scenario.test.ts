import { TransferOutcomeScenario } from "@/domains/transfer/api/get-transfer/get-transfer";
import { TRANSFER_SCENARIOS } from "@/mocks/scenarios/transfer-scenarios";
import { TransferFlowScenario } from "@/screens/transfer/state/transfer-flow";

it.each<[string, Record<string, string>]>([
  ["flow notice", TransferFlowScenario],
  ["transfer outcome", TransferOutcomeScenario],
])("names in each %s a scenario the registry holds", (_, scenarioIds) => {
  expect(
    Object.values(scenarioIds).filter(
      (scenarioId) => !Object.hasOwn(TRANSFER_SCENARIOS, scenarioId),
    ),
  ).toEqual([]);
});
