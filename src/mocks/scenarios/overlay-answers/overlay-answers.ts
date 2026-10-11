import type { RequestHandler } from "msw";
import { getResponse, http, HttpResponse } from "msw";

import { bankError, httpResponseFrom } from "@/mocks/bank/answers/answers";
import { toMalaysiaIso } from "@/mocks/bank/malaysia-time/malaysia-time";
import { switcherStore } from "@/mocks/switcher/switcher-store/switcher-store";

export const lostAnswer = () => HttpResponse.error();
export const unknownCodeAnswer = () =>
  httpResponseFrom(
    bankError(400, "NEW_BANK_CODE", "A code added after this app was built."),
  );
export const serverErrorAnswer = () =>
  httpResponseFrom(
    bankError(500, "INTERNAL_ERROR", "The bank could not answer."),
  );
export const maintenanceAnswer =
  (codes: { ServiceUnavailable: string }) =>
  // Typed by hand: inferring it loops through the store's type back to the registry's ids.
  (): Response =>
    httpResponseFrom({
      status: 503,
      body: {
        error: {
          code: codes.ServiceUnavailable,
          message: "Transfers are paused.",
          until: toMalaysiaIso(
            switcherStore.getState().activatedAtMs + 2 * HOUR_MS,
          ),
        },
      },
    });
export const errorAnswer =
  (status: number, code: string, message: string) => () =>
    httpResponseFrom(bankError(status, code, message));

export function commitThenAnswer(
  path: string,
  bankHandlers: RequestHandler[],
  answer: () => Response,
) {
  return http.post(path, async ({ request }) => {
    await getResponse(bankHandlers, request);
    return answer();
  });
}

const HOUR_MS = 60 * 60 * 1000;
