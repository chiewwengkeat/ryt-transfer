import { TRANSFER_SCENARIOS } from "@/mocks/scenarios/transfer-scenarios/transfer-scenarios";

import { TransferScenarioId } from "./transfer-scenario-id";

it("names in the enum exactly the scenarios the registry holds", () => {
  expect(Object.values(TransferScenarioId).sort()).toEqual(
    Object.keys(TRANSFER_SCENARIOS).sort(),
  );
});
