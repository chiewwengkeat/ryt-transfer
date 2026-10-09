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

import { bankPorts } from "./ports/ports";
import type * as BankPorts from "./ports/ports";
import { pickTransferScenario } from "./bank";
import type * as DemoBank from "./bank";
import type * as SwitcherStore from "@/mocks/switcher/switcher-store/switcher-store";

// A fresh module registry is a fresh app: nothing survives it but what the bank saved.
function restartTheApp() {
  let restarted:
    | {
        handlers: RequestHandler[];
        getResponse: typeof Msw.getResponse;
        restoredScenarioId: string | null;
      }
    | undefined;
  jest.isolateModules(() => {
    jest
      .requireActual<typeof BankPorts>("./ports/ports")
      .bindBankPorts(bankPorts());
    restarted = {
      handlers: jest
        .requireActual<typeof DemoBank>("./bank")
        .handlersForActiveScenario(),
      getResponse: jest.requireActual<typeof Msw>("msw").getResponse,
      restoredScenarioId: jest
        .requireActual<typeof SwitcherStore>(
          "@/mocks/switcher/switcher-store/switcher-store",
        )
        .switcherStore.getState().scenarioId,
    };
  });
  return {
    restoredScenarioId: restarted!.restoredScenarioId,
    askBank: async <ResponseBody>(path: string) => {
      const response = await restarted!.getResponse(
        restarted!.handlers,
        new Request(`${BANK_ORIGIN}${path}`),
      );
      return (await response!.json()) as ResponseBody;
    },
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

  const { askBank } = restartTheApp();
  const restartedAccount =
    await askBank<GetPrimaryAccountResponse>("/accounts/primary");
  const { transfer } = await askBank<GetTransferResponse>(
    `/transfers/${started.created.transfer.transferId}`,
  );

  expect(restartedAccount.balance).toEqual(account.balance);
  expect(transfer.status).toBe(TransferStatus.Completed);
});

it("keeps the picked scenario across a restart", async () => {
  pickTransferScenario("transfer.start_unexpected");

  const answer =
    await restartTheApp().askBank<BankErrorBody>("/accounts/primary");

  expect(answer.error.code).toBe("NEW_BANK_CODE");
});

it.each(["transfer.retired", "toString"])(
  "drops a saved pick of %s, which the scenario registry does not hold",
  async (savedScenarioId) => {
    pickTransferScenario("transfer.start_unexpected");
    const saved = JSON.parse(bankPorts().storage.read() ?? "{}") as {
      scenarioPick: { scenarioId: string };
    };
    bankPorts().storage.write(
      JSON.stringify({
        ...saved,
        scenarioPick: { ...saved.scenarioPick, scenarioId: savedScenarioId },
      }),
    );

    const { askBank, restoredScenarioId } = restartTheApp();
    const answer =
      await askBank<GetPrimaryAccountResponse>("/accounts/primary");

    expect(restoredScenarioId).toBeNull();
    expect(answer.balance.currency).toBe("MYR");
  },
);
