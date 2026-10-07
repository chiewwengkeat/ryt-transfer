import { BANK_ORIGIN } from "./bank-client";
import { scenarioTest } from "./scenario-test";

it(
  "fails every request for lack of a connection",
  scenarioTest("transfer.offline", async () => {
    await expect(fetch(`${BANK_ORIGIN}/accounts/primary`)).rejects.toThrow();
  }),
);

it("answers from the bank again once a scenario's test has ended", async () => {
  const response = await fetch(`${BANK_ORIGIN}/accounts/primary`);

  expect(response.status).toBe(200);
});
