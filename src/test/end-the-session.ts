import { act, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import { accountKeys } from "@/domains/account/api/account.keys";
import { requestJson } from "@/shared/http/transport";

import { mswServer } from "./msw-server";
import { askOpenAppToReadAgain } from "./render-route";

export async function endSessionWithAnyRequest() {
  mswServer.use(
    http.get("*/any-request", () => new HttpResponse(null, { status: 401 })),
  );
  await act(async () => {
    await requestJson("/any-request").catch(() => undefined);
  });
}

export async function endTheSessionThroughAnotherRead() {
  mswServer.use(
    http.get(
      "*/accounts/primary",
      () =>
        HttpResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Test." } },
          { status: 401 },
        ),
      { once: true },
    ),
  );
  askOpenAppToReadAgain(accountKeys.primaryAccount);
  return screen.findByRole("button", { name: "Sign in again" });
}
