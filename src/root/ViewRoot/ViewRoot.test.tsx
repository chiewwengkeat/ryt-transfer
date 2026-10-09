import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo, AppState, Pressable, Text } from "react-native";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import { askForApprovalPin } from "@/domains/approval/lib/approval-pin-sheet/approval-pin-sheet";
import {
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/lib/pending-transfers/pending-transfers";
import { useTrackScenarioShown } from "@/domains/transfer/hooks/use-track-scenario-shown/use-track-scenario-shown";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { requestJson } from "@/shared/http/transport/transport";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import { sendToBank, startTestTransfer } from "@/test/bank-client";
import { pressHardwareBack } from "@/test/hardware-back";
import { reportedScenarios } from "@/test/harness/recording-sink";
import { mswServer } from "@/test/msw-server";
import { relaunchApp, renderRoute } from "@/test/render-route";

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

async function endSessionWithAnyRequest() {
  mswServer.use(
    http.get("*/any-request", () => new HttpResponse(null, { status: 401 })),
  );
  await act(async () => {
    await requestJson("/any-request").catch(() => undefined);
  });
}

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

it("discards another customer's pending transfers at launch, and keeps the signed-in customer's", async () => {
  const { body: signedInAccount } = await sendToBank<GetPrimaryAccountResponse>(
    "GET",
    "/accounts/primary",
  );
  const {
    created: { transfer: ownTransfer },
  } = await startTestTransfer(10_000);
  const {
    created: { transfer: earlierCustomersTransfer },
  } = await startTestTransfer(5_000);
  const pendingSince = {
    idempotencyKey: "key-earlier",
    createdAt: "2026-10-07T01:00:00.000Z",
    stage: PendingTransferStage.Approving,
  };
  await writePendingTransfer("cus_earlier", {
    ...pendingSince,
    transferId: earlierCustomersTransfer.transferId,
  });
  await writePendingTransfer(signedInAccount.customerId, {
    ...pendingSince,
    transferId: ownTransfer.transferId,
  });

  const view = await renderRoute("/", {
    appDir: "src/app",
    overrides: { index: () => <Text>Home</Text> },
  });
  await waitFor(() => {
    expect(view.getPathname()).toBe(
      `/transfer/result/${ownTransfer.transferId}`,
    );
  });
  mswServer.use(
    http.get("*/accounts/primary", () =>
      HttpResponse.json({ ...signedInAccount, customerId: "cus_earlier" }),
    ),
  );
  const relaunched = await relaunchApp(view);
  await act(() => jest.advanceTimersByTimeAsync(500));

  expect(relaunched.getPathname()).toBe("/");
});

it("answers an open PIN request as closed when the app's root goes away, so its caller is not left waiting", async () => {
  const view = await renderRoute("/", {
    appDir: "src/app",
    overrides: { index: () => <Text>Home</Text> },
  });
  let pinAnswer: string | null | undefined;
  await act(() => {
    void askForApprovalPin({ message: "Approve with your PIN." }).then(
      (answer) => {
        pinAnswer = answer;
      },
    );
  });
  await screen.findByRole("button", { name: "Approve" });

  await view.unmount();

  await waitFor(() => expect(pinAnswer).toBeNull());
});
