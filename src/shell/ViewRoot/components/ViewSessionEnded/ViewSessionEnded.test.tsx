import { act, fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import type { GetTransferResponse } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { requestJson } from "@/shared/http/transport";
import { sendToBank } from "@/test/bank-client";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

const STILL_CHECKED =
  "Your last transfer is still being checked. If you contact us, quote this reference:";

async function sendRm100FromHomeToTheResultPage() {
  await pairPhoneAsTheDemoLaunchDoes();
  const view = await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await fireEvent.changeText(
    await screen.findByLabelText("Amount (RM)"),
    "100",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  // Long enough for an approval whose answer is lost to be sent twice more, seconds apart.
  await screen.findByRole("button", { name: "Done" }, { timeout: 10_000 });
  return view;
}

async function endTheSession() {
  mswServer.use(http.all("*", () => new HttpResponse(null, { status: 401 })));
  await act(async () => {
    await requestJson("/any-request").catch(() => undefined);
  });
}

it(
  "quotes the bank's reference for a transfer still processing when the session ends",
  scenarioTest("transfer.processing", async () => {
    const view = await sendRm100FromHomeToTheResultPage();
    // The bank answers after a delay, which the route's fake timers would hold forever.
    jest.useRealTimers();
    const { body } = await sendToBank<GetTransferResponse>(
      "GET",
      view.getPathname()?.replace("/transfer/result", "/transfers") ?? "",
    );

    await endTheSession();

    expect(
      await screen.findByText(`${STILL_CHECKED} ${body.transfer.reference}`),
    ).toBeOnTheScreen();
  }),
);

it(
  "quotes the transfer's id when the session ends while the bank cannot be reached to check it",
  scenarioTest("transfer.status_unreachable", async () => {
    const view = await sendRm100FromHomeToTheResultPage();
    const transferId = view.getPathname()?.replace("/transfer/result/", "");

    await endTheSession();

    expect(
      await screen.findByText(`${STILL_CHECKED} ${transferId}`),
    ).toBeOnTheScreen();
  }),
);

it(
  "quotes nothing when the session ends after the bank has confirmed where the money went",
  scenarioTest("transfer.completed", async () => {
    await sendRm100FromHomeToTheResultPage();

    await endTheSession();

    expect(
      await screen.findByRole("header", { name: "Your session has ended" }),
    ).toBeOnTheScreen();
    await expect(
      screen.findByText(/still being checked/, {}, { timeout: 500 }),
    ).rejects.toThrow("Unable to find an element with text");
  }),
);
