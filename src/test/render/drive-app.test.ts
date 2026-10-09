import { BANK_ORIGIN } from "@/test/mock-bank/mock-bank";
import { scenarioTest } from "./drive-app";

it(
  "fails every request for lack of a connection",
  scenarioTest("transfer.offline", async () => {
    await expect(fetch(`${BANK_ORIGIN}/accounts/primary`)).rejects.toThrow();
  }),
);

// ⛔ Keep this after the test above: alone, it passes whatever the reset leaves behind.
it("answers from the bank again once a scenario's test has ended", async () => {
  const response = await fetch(`${BANK_ORIGIN}/accounts/primary`);

  expect(response.status).toBe(200);
});
