import { bankPorts } from "@/mocks/bank/ports";
import type * as BankPorts from "@/mocks/bank/ports";
import { clearTransferScenario, pickTransferScenario } from "@/mocks/demo-bank";

import { subscribeToBiometricsOff } from "./biometrics-off";
import type * as BiometricsOff from "./biometrics-off";

it("answers at once whether No biometrics is picked, then each time that changes", () => {
  const answers: boolean[] = [];

  const unsubscribe = subscribeToBiometricsOff((biometricsOff) => {
    answers.push(biometricsOff);
  });
  pickTransferScenario("transfer.biometrics_unavailable");
  pickTransferScenario("transfer.offline");
  clearTransferScenario();
  unsubscribe();
  pickTransferScenario("transfer.biometrics_unavailable");

  expect(answers).toEqual([false, true, false]);
});

it("answers that biometrics are off at once when the app restarts with No biometrics still picked", () => {
  pickTransferScenario("transfer.biometrics_unavailable");
  const answersAfterRestart: boolean[] = [];

  // A fresh module registry is a fresh app: nothing survives it but what the bank saved.
  jest.isolateModules(() => {
    jest
      .requireActual<typeof BankPorts>("@/mocks/bank/ports")
      .bindBankPorts(bankPorts());
    jest
      .requireActual<typeof BiometricsOff>("./biometrics-off")
      .subscribeToBiometricsOff((biometricsOff) => {
        answersAfterRestart.push(biometricsOff);
      })();
  });

  expect(answersAfterRestart).toEqual([true]);
});
