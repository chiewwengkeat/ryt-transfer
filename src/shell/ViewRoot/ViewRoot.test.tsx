import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo, Pressable, Text } from "react-native";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import {
  listPendingTransfers,
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/hooks/pending-transfers";
import { requestJson } from "@/shared/http/transport";
import { sendToBank } from "@/test/bank-client";
import { pressHardwareBack } from "@/test/hardware-back";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";

function HomeBalance() {
  const { data } = useQuery({
    queryKey: ["balance"],
    queryFn: () => requestJson<{ amount: string }>("/balance"),
  });
  return <Text>{data?.amount ?? "Loading balance"}</Text>;
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
  const {
    body: { customerId },
  } = await sendToBank<GetPrimaryAccountResponse>("GET", "/accounts/primary");
  const pendingSince = {
    idempotencyKey: "key-earlier",
    createdAt: "2026-10-07T01:00:00.000Z",
    stage: PendingTransferStage.Approving,
  };
  await writePendingTransfer("cus_earlier", {
    ...pendingSince,
    transferId: "trf_earlier",
  });
  await writePendingTransfer(customerId, {
    ...pendingSince,
    transferId: "trf_own",
  });

  await renderRoute("/", {
    appDir: "src/app",
    overrides: { index: () => <Text>Home</Text> },
  });

  await waitFor(async () => {
    expect(await listPendingTransfers("cus_earlier")).toEqual([]);
  });
  expect(await listPendingTransfers(customerId)).toEqual([
    { ...pendingSince, transferId: "trf_own" },
  ]);
});
