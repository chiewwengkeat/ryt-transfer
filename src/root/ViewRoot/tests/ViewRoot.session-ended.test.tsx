import { useQuery } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo, AppState, Pressable, Text } from "react-native";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import {
  type GetTransferResponse,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { useTrackScenarioShown } from "@/domains/transfer/hooks/use-track-scenario-shown/use-track-scenario-shown";
import {
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/lib/pending-transfers/pending-transfers";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { requestJson } from "@/shared/http/transport/transport";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import { reportedScenarios } from "@/test/doubles/native-doubles";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  clearTransferScenario,
  mswServer,
  sendToBank,
  startTestTransfer,
} from "@/test/mock-bank/mock-bank";
import { pressHardwareBack, scenarioTest } from "@/test/render/drive-app";
import { endSessionWithAnyRequest } from "@/test/render/interrupt-app";
import { relaunchApp, renderRoute } from "@/test/render/render-route";

it(
  "covers the app with its own screen, offering only to sign in again, when the bank says the session has ended",
  scenarioTest("transfer.session_ended", async () => {
    await renderRoute("/");

    expect(
      await screen.findByRole("header", { name: "Your session has ended" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText("For your security, sign in again to carry on."),
    ).toBeOnTheScreen();
    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.props.accessibilityLabel as unknown),
    ).toEqual(["Sign in again"]);
    expect(reportedScenarios()).toContain("transfer.session_ended");
  }),
);

it(
  "covers a transfer under way when the session ends there, and returns to its step once they sign in again",
  scenarioTest("transfer.session_ended", async () => {
    const view = await renderRoute("/transfer");
    expect(
      await screen.findByRole("header", { name: "Your session has ended" }),
    ).toBeOnTheScreen();

    clearTransferScenario();
    await fireEvent.press(
      screen.getByRole("button", { name: "Sign in again" }),
    );

    expect(
      screen.queryByRole("header", { name: "Your session has ended" }),
    ).toBeNull();
    expect(
      await screen.findByLabelText("DuitNow mobile number"),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toBe("/transfer");
  }),
);

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
  "quotes the bank's reference that the result page quoted when the session ends after a relaunch whose read of the transfer fails",
  scenarioTest("transfer.processing", async () => {
    const view = await sendRm100FromHomeToTheResultPage();
    const quotedOnResult = await screen.findByText(
      /^If you contact us, quote this reference: \d{8}[\dA-F]{8}$/,
    );
    const reference = String(quotedOnResult.props.children).replace(
      "If you contact us, quote this reference: ",
      "",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    await screen.findByText(/still being checked/);
    mswServer.use(
      http.get(
        "*/transfers/:transferId",
        () => new HttpResponse(null, { status: 503 }),
      ),
    );
    await relaunchApp(view);
    await screen.findByText(/still being checked/);

    await endTheSession();

    expect(
      await screen.findByText(`${STILL_CHECKED} ${reference}`),
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

it("quotes nothing when the session ends while Home still announces how an earlier transfer ended", async () => {
  const {
    body: { customerId },
  } = await sendToBank<GetPrimaryAccountResponse>("GET", "/accounts/primary");
  const { created, lookup } = await startTestTransfer(10_000);
  await writePendingTransfer(customerId, {
    transferId: created.transfer.transferId,
    idempotencyKey: "approval-key",
    createdAt: "2026-10-07T01:30:00.000Z",
    stage: PendingTransferStage.Processing,
  });
  mswServer.use(
    http.get("*/transfers/:transferId", () =>
      HttpResponse.json({
        transfer: {
          ...created.transfer,
          reference: "20261007C0FFEE00",
          status: TransferStatus.Completed,
        },
      }),
    ),
  );
  const sentNotice = `Your transfer of RM 100.00 to ${lookup.recipient.registeredName} was sent — money moved.`;
  const view = await renderRoute("/");
  await screen.findByText(sentNotice);
  // Announced again at the next launch, so the record outlived its announcement and the view has one to pass over.
  await relaunchApp(view);
  await screen.findByText(sentNotice);

  await endTheSession();

  expect(
    await screen.findByRole("header", { name: "Your session has ended" }),
  ).toBeOnTheScreen();
  await expect(
    screen.findByText(/still being checked/, {}, { timeout: 500 }),
  ).rejects.toThrow("Unable to find an element with text");
});

it("covers the app with the session-ended view when a request answers 401", async () => {
  answerBalance("RM 10.00");
  await renderRoute("/", {
    appDir: "src/app",
    overrides: { index: HomeBalance },
  });
  expect(await screen.findByText("RM 10.00")).toBeOnTheScreen();

  await endSessionWithAnyRequest();

  expect(
    screen.getByRole("header", { name: "Your session has ended" }),
  ).toBeOnTheScreen();
  expect(screen.queryByText("RM 10.00")).toBeNull();
  expect(
    screen.getByText("RM 10.00", { includeHiddenElements: true }),
  ).toBeOnTheScreen();
});

it("reports only the session's end when the screens beneath review read again into a 401", async () => {
  await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer", disabled: false }),
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
  await screen.findByRole("button", { name: "Transfer" });
  const scenariosReportedOnTheWay = reportedScenarios().length;
  mswServer.use(http.all("*", () => new HttpResponse(null, { status: 401 })));

  // Back from the background, the reads of every screen in the stack go again; review's answered name check does not.
  const { calls, results } = jest.mocked(AppState).addEventListener.mock;
  await act(() => {
    calls.forEach(([eventName, listener], index) => {
      const subscription = results[index]?.value as { remove: jest.Mock };
      if (eventName !== "change" || subscription.remove.mock.calls.length > 0)
        return;
      listener("background");
      listener("active");
    });
  });

  expect(
    await screen.findByRole("header", { name: "Your session has ended" }),
  ).toBeOnTheScreen();
  // Covered screens render late: read the reports before they show their failure and this passes either way.
  await waitFor(() => {
    expect(
      screen.getAllByText("Something unexpected went wrong.", {
        includeHiddenElements: true,
      }),
    ).toHaveLength(4);
  });
  expect(reportedScenarios().slice(scenariosReportedOnTheWay)).toEqual([
    "transfer.session_ended",
  ]);
});

it("reports and announces only the session's end when the screen on top fails its own read into a 401", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  announce.mockClear();
  mswServer.use(
    http.get("*/balance", () => new HttpResponse(null, { status: 401 })),
  );

  await renderRoute("/", {
    appDir: "src/app",
    overrides: { index: HomeBalanceOrItsFailure },
  });

  expect(
    await screen.findByRole("header", { name: "Your session has ended" }),
  ).toBeOnTheScreen();
  // ⛔ Keep this wait: without it the reports are read before the screen has failed, and this passes either way.
  await screen.findByText(BALANCE_FAILURE, { includeHiddenElements: true });
  expect(reportedScenarios()).toEqual(["transfer.session_ended"]);
  expect(announce).not.toHaveBeenCalledWith(BALANCE_FAILURE);
});

it("moves a screen reader to the session-ended view's title", async () => {
  // Jest has no screen reader: the focus request is the nearest thing it can see.
  const focusRequests = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
  focusRequests.mockClear();
  await renderRoute("/", {
    appDir: "src/app",
    overrides: { index: () => <Text>Home</Text> },
  });

  await endSessionWithAnyRequest();

  expect(focusRequests).toHaveBeenCalledWith(
    expect.objectContaining({
      props: expect.objectContaining({
        accessibilityRole: "header",
        children: "Your session has ended",
      }) as object,
    }),
    "focus",
  );
});

it("signs back in to the app it covered, with its data fetched again", async () => {
  answerBalance("RM 10.00");
  await renderRoute("/", {
    appDir: "src/app",
    overrides: { index: HomeBalance },
  });
  expect(await screen.findByText("RM 10.00")).toBeOnTheScreen();
  await endSessionWithAnyRequest();
  answerBalance("RM 25.00");

  await fireEvent.press(screen.getByRole("button", { name: "Sign in again" }));

  expect(
    screen.queryByRole("header", { name: "Your session has ended" }),
  ).toBeNull();
  expect(await screen.findByText("RM 25.00")).toBeOnTheScreen();
});

it("ignores hardware Back while the session-ended view covers the app, and obeys it after", async () => {
  const view = await renderRoute("/", {
    appDir: "src/app",
    overrides: {
      index: () => (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            router.push("./details");
          }}
        >
          <Text>Open details</Text>
        </Pressable>
      ),
      details: () => <Text>Details</Text>,
    },
  });
  await fireEvent.press(screen.getByRole("button", { name: "Open details" }));
  await endSessionWithAnyRequest();

  await pressHardwareBack();
  const pathnameUnderTheView = view.getPathname();
  await fireEvent.press(screen.getByRole("button", { name: "Sign in again" }));
  await pressHardwareBack();

  expect(pathnameUnderTheView).toBe("/details");
  expect(view.getPathname()).toBe("/");
});

const STILL_CHECKED =
  "Your last transfer is still being checked. If you contact us, quote this reference:";

async function sendRm100FromHomeToTheResultPage() {
  await pairPhoneAsTheDemoLaunchDoes();
  const view = await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer", disabled: false }),
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

function HomeBalance() {
  const { data } = useQuery({
    queryKey: ["balance"],
    queryFn: () => requestJson<{ amount: string }>("/balance"),
  });
  return <Text>{data?.amount ?? "Loading balance"}</Text>;
}

const BALANCE_FAILURE = "Your balance can't be shown right now.";

function HomeBalanceOrItsFailure() {
  const balance = useQuery({
    queryKey: ["balance"],
    queryFn: () => requestJson<{ amount: string }>("/balance"),
  });
  useTrackScenarioShown(
    balance.isError ? TransferScenarioId.StartUnexpected : undefined,
  );
  return balance.isError ? (
    <BannerNotice message={BALANCE_FAILURE} />
  ) : (
    <Text>{balance.data?.amount ?? "Loading balance"}</Text>
  );
}

function answerBalance(amount: string) {
  mswServer.use(http.get("*/balance", () => HttpResponse.json({ amount })));
}
