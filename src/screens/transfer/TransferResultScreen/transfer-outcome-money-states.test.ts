import { TransferOutcomeScenario } from "@/domains/transfer/api/get-transfer/get-transfer";

import { MONEY_STATE_BY_OUTCOME } from "./transfer-outcome-money-states";

// Jest defines it; the app's types deliberately leave out Node's globals.
declare const __dirname: string;

const { readFileSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: "utf8") => string;
}>("node:fs");

const matrixSections = readFileSync(
  `${__dirname}/../scenarios/transfer.md`,
  "utf8",
)
  .split(/^### /m)
  .slice(1)
  .map((section) => ({
    id: /^`([^`]+)`$/m.exec(section)?.[1],
    money: /^- \*\*Money:\*\* (.+)$/m.exec(section)?.[1],
    shownAs: /^- \*\*Shown as:\*\* (.+)$/m.exec(section)?.[1] ?? "",
  }));

it("gives each outcome its matrix section's money state", () => {
  expect(MONEY_STATE_BY_OUTCOME).toEqual(
    Object.fromEntries(
      Object.keys(MONEY_STATE_BY_OUTCOME).map((outcome) => [
        outcome,
        matrixSections.find((section) => section.id === outcome)?.money,
      ]),
    ),
  );
});

it("covers every section the matrix shows on the result page", () => {
  const resultPageIds = matrixSections
    .filter((section) => section.shownAs.includes("the result page"))
    .map((section) => section.id);

  expect(resultPageIds).toContain(TransferOutcomeScenario.Completed);
  expect(Object.keys(MONEY_STATE_BY_OUTCOME)).toEqual(
    expect.arrayContaining(resultPageIds),
  );
});
