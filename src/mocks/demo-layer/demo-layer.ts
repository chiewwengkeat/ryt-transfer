import { randomUUID } from "expo-crypto";
import { delay, getResponse, HttpResponse, type RequestHandler } from "msw";
import type { ComponentType, ReactNode } from "react";

import { registerApprovalKeys } from "@/domains/approval/api/register-approval-keys/register-approval-keys";
import {
  createApprovalKeys,
  hasApprovalKeysOnFile,
  saveApprovalKeyIds,
} from "@/domains/approval/lib/approval-keys/approval-keys";
import { handlersForActiveScenario } from "@/mocks/bank/bank";
import { DEMO_PIN } from "@/mocks/bank/seed/seed";
import { bankState } from "@/mocks/bank/state/state";
import { watchAmountStepOpen } from "@/mocks/scenarios/amount-step-open/amount-step-open";
import type { PhoneSideScenarioId } from "@/mocks/scenarios/transfer-scenarios/transfer-scenarios";
import ViewDemo from "@/mocks/switcher/components/ViewDemo/ViewDemo";
import { switcherStore } from "@/mocks/switcher/switcher-store/switcher-store";
import type { Send } from "@/shared/http/transport/transport";

export default {
  demoSend: createDemoSend(handlersForActiveScenario),
  demoPin: DEMO_PIN,
  ViewDemo,
  subscribeToScenarioChange: (onChange) => switcherStore.subscribe(onChange),
  subscribeToPhoneSidePick,
  watchAmountStepOpen,
  // Stands in for the pairing a host app made long ago, so the bank holds no cooling-off against it.
  async pairPhoneAtFirstLaunch() {
    if (await hasApprovalKeysOnFile()) return;
    const { possessionKeyId, biometricKeyId } = await registerApprovalKeys(
      await createApprovalKeys(),
      randomUUID(),
    );
    if (possessionKeyId === undefined || biometricKeyId === undefined)
      throw new Error("The bank registered only some of the approval keys.");
    await saveApprovalKeyIds({ possessionKeyId, biometricKeyId });
  },
} satisfies DemoLayer;

export interface DemoLayer {
  demoSend: Send;
  demoPin: string;
  pairPhoneAtFirstLaunch: () => Promise<void>;
  ViewDemo: ComponentType<{
    appSheetOpen: boolean;
    children: ReactNode;
    onResetDemo: () => Promise<void>;
  }>;
  subscribeToScenarioChange: (onChange: () => void) => () => void;
  subscribeToPhoneSidePick: (
    scenarioId: PhoneSideScenarioId,
    onChange: (picked: boolean) => void,
  ) => () => void;
  watchAmountStepOpen: (isAmountStepOpen: () => boolean) => void;
}

// Stays exported: the bundle check finds this name in demo builds, and minify keeps only an export's.
export function createDemoSend(getHandlers: () => RequestHandler[]): Send {
  return async (request) => {
    // Never under Jest: a demo build's route tests run on fake timers, which would hold every request.
    if (process.env.NODE_ENV !== "test") await delay(BANK_ANSWER_DELAY_MS);
    let response: Response | undefined;
    try {
      response = await getResponse(getHandlers(), request);
    } catch (failure) {
      // The 500 setupServer gives a handler that throws: a phone must see what Jest sees.
      const { name, message, stack } =
        failure instanceof Error ? failure : new Error(String(failure));
      return HttpResponse.json(
        { name, message, stack },
        { status: 500, statusText: "Unhandled Exception" },
      );
    }
    // fetch rejects with a TypeError on a dead network; no answer, and a scenario's
    // HttpResponse.error(), must reach the app exactly as that does.
    if (response === undefined || response.type === "error")
      throw new TypeError("Network request failed");
    return response;
  };
}

function subscribeToPhoneSidePick(
  scenarioId: PhoneSideScenarioId,
  onChange: (picked: boolean) => void,
) {
  // Loaded first: loading restores a pick saved before a restart, and the first answer must carry it.
  bankState();
  const isPicked = (pick: ReturnType<typeof switcherStore.getState>) =>
    pick.scenarioId === scenarioId;
  onChange(isPicked(switcherStore.getState()));
  return switcherStore.subscribe((pick, previousPick) => {
    if (isPicked(pick) !== isPicked(previousPick)) onChange(isPicked(pick));
  });
}

// About as long as a real bank takes, so the app's progress states show.
const BANK_ANSWER_DELAY_MS = 400;
