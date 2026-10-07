import type { RequestHandler } from "msw";
import type * as Msw from "msw";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import {
  TransferStatus,
  type GetTransferResponse,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import {
  BANK_ORIGIN,
  pairTestPhone,
  sendToBank,
  signTestApproval,
  startTestTransfer,
  type BankErrorBody,
} from "@/test/bank-client";
import { jestBankPorts } from "@/test/jest-bank-ports";

import type * as BankPorts from "./bank/ports";
import { pickTransferScenario } from "./demo-bank";
import type * as DemoBank from "./demo-bank";

// A fresh module registry is a fresh app: nothing survives it but what the bank saved.
function restartTheApp() {
  let restarted:
    | { handlers: RequestHandler[]; getResponse: typeof Msw.getResponse }
    | undefined;
  jest.isolateModules(() => {
    jest
      .requireActual<typeof BankPorts>("./bank/ports")
      .bindBankPorts(jestBankPorts);
    restarted = {
      handlers: jest
        .requireActual<typeof DemoBank>("./demo-bank")
        .handlersForActiveScenario(),
      getResponse: jest.requireActual<typeof Msw>("msw").getResponse,
    };
  });
  return async <ResponseBody>(path: string) => {
    const response = await restarted!.getResponse(
      restarted!.handlers,
      new Request(`${BANK_ORIGIN}${path}`),
    );
    return (await response!.json()) as ResponseBody;
  };
}

it("keeps a completed transfer and its debit across a restart", async () => {
  const { biometricKeyId } = await pairTestPhone();
  const started = await startTestTransfer(2_550);
  await sendToBank("POST", started.approvalPath, {
    body: signTestApproval(started, {
      kind: "biometric",
      keyId: biometricKeyId,
    }),
  });
  const { body: account } = await sendToBank<GetPrimaryAccountResponse>(
    "GET",
    "/accounts/primary",
  );

  const askRestartedBank = restartTheApp();
  const restartedAccount =
    await askRestartedBank<GetPrimaryAccountResponse>("/accounts/primary");
  const { transfer } = await askRestartedBank<GetTransferResponse>(
    `/transfers/${started.created.transfer.transferId}`,
  );

  expect(restartedAccount.balance).toEqual(account.balance);
  expect(transfer.status).toBe(TransferStatus.Completed);
});

it("keeps the picked scenario across a restart", async () => {
  pickTransferScenario("transfer.start_unexpected");

  const answer = await restartTheApp()<BankErrorBody>("/accounts/primary");

  expect(answer.error.code).toBe("NEW_BANK_CODE");
});

it("drops a saved pick that the scenario registry no longer has", async () => {
  pickTransferScenario("transfer.start_unexpected");
  const saved = JSON.parse(jestBankPorts.storage.read() ?? "{}") as {
    scenarioPick: { scenarioId: string };
  };
  jestBankPorts.storage.write(
    JSON.stringify({
      ...saved,
      scenarioPick: { ...saved.scenarioPick, scenarioId: "transfer.retired" },
    }),
  );

  const answer =
    await restartTheApp()<GetPrimaryAccountResponse>("/accounts/primary");

  expect(answer.balance.currency).toBe("MYR");
});
