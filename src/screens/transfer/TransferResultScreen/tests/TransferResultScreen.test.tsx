import {
  type GetTransferResponse,
  TransferDirection,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { observedRecords } from "@/test/doubles/native-doubles";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  lookUpTestRecipient,
  mswServer,
  sendToBank,
  sentRequests,
  startTestTransfer,
} from "@/test/mock-bank/mock-bank";
import {
  finishOpeningScreen,
  readBankOnRealTimers,
  scenarioTest,
  turnOnPhoneReduceMotion,
  watchReduceMotionOfAnimations,
} from "@/test/render/drive-app";
import {
  relaunchAppAndWaitForItsLaunchChecks,
  renderRoute,
} from "@/test/render/render-route";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { getFixedT } from "i18next";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo } from "react-native";
import { ReduceMotion } from "react-native-reanimated";
import {
  buttonsOnTheResultPage,
  sendRm100FromHome,
} from "./TransferResultScreen.helper";

it(
  "gives a receipt in Malaysia time with the note, offers only Done, and Home's balance and limit move with the money",
  scenarioTest("transfer.completed", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const { recipient } = await lookUpTestRecipient("012-345 6789");
    const view = await renderRoute("/");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer", disabled: false }),
    );
    await fireEvent.changeText(
      await screen.findByLabelText("DuitNow mobile number"),
      "012-345 6789",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("RM 12,845.50");
    await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
    await fireEvent.changeText(
      screen.getByLabelText("Note (optional)"),
      "Lunch",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        `RM 100.00 sent to ${recipient.registeredName} — money moved.`,
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText("•••• 6789")).toBeOnTheScreen();
    expect(screen.getByText(recipient.bankName)).toBeOnTheScreen();
    const { body } = await readBankOnRealTimers(() =>
      sendToBank<GetTransferResponse>(
        "GET",
        view.getPathname()?.replace("/transfer/result", "/transfers") ?? "",
      ),
    );
    expect(
      screen.getByText(formatMalaysianDateTime(body.transfer.updatedAt, t)),
    ).toBeOnTheScreen();
    expect(screen.getByText(body.transfer.reference ?? "")).toBeOnTheScreen();
    expect(screen.getByText("Note")).toBeOnTheScreen();
    expect(screen.getByText("Lunch")).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Done", "Back to Home"]);

    await fireEvent.press(screen.getByRole("button", { name: "Done" }));

    expect(await screen.findByText("RM 12,745.50")).toBeOnTheScreen();
    expect(
      screen.getByText("You can send RM 4,900.00 more today"),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toBe("/");
  }),
);

it("moves a screen reader to the outcome a moment after the page has finished opening, once VoiceOver has placed its own focus", async () => {
  // Jest has no screen reader: the focus request is the nearest thing it can see.
  const focusRequests = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
  focusRequests.mockClear();
  const outcomeFocusRequests = () =>
    focusRequests.mock.calls.filter(
      ([target, eventType]) =>
        eventType === "focus" &&
        (target as { props?: { children?: unknown } }).props?.children ===
          "Transfer sent",
    );
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/");
  await sendRm100FromHome();
  const heading = await screen.findByRole("header", { name: "Transfer sent" });
  const focusRequestsWhileOpening = outcomeFocusRequests().length;

  await finishOpeningScreen(heading);
  await act(() => jest.advanceTimersByTimeAsync(500));
  const focusRequestsHalfASecondAfterOpening = outcomeFocusRequests().length;
  await act(() => jest.advanceTimersByTimeAsync(500));

  expect(focusRequestsWhileOpening).toBe(0);
  expect(focusRequestsHalfASecondAfterOpening).toBe(0);
  expect(outcomeFocusRequests()).toHaveLength(1);
});

it("leaves out the note and reference rows when the bank sends them empty", async () => {
  mswServer.use(
    http.get("*/transfers/:transferId", () =>
      HttpResponse.json({
        transfer: {
          transferId: "trf_test",
          version: 3,
          direction: TransferDirection.Out,
          status: TransferStatus.Completed,
          funds: TransferFunds.Debited,
          counterparty: {
            registeredName: "NG CHEE KEONG",
            idType: RecipientIdType.Mobile,
            idValueMasked: "•••• 6789",
            bankName: "Maybank",
          },
          amount: { minor: 10_000, currency: "MYR" },
          note: "",
          reference: "",
          createdAt: "2026-10-07T09:30:00+08:00",
          updatedAt: "2026-10-07T09:30:05+08:00",
        },
      } satisfies GetTransferResponse),
    ),
  );
  await renderRoute("/transfer/result/trf_test", {
    appDir: "src/app",
    overrides: {},
  });

  expect(
    await screen.findByText("RM 100.00 sent to NG CHEE KEONG — money moved."),
  ).toBeOnTheScreen();
  expect(screen.queryByText("Note")).toBeNull();
  expect(screen.queryByText("Reference")).toBeNull();
});

it(
  "says the bank stopped a transfer its fraud check blocked, and points to the bank, never back to sending",
  scenarioTest("transfer.fraud_blocked", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/");
    await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Transfer stopped" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "The bank stopped this transfer to protect you, and will contact you about it — no money moved.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/quote this reference/)).toBeNull();
    expect(buttonsOnTheResultPage()).toEqual(["Done", "Back to Home"]);
  }),
);

it(
  "says a held transfer will complete or be refunded, with the bank's reference to quote, and Home announces it once it completes",
  scenarioTest("transfer.held_for_review", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/");
    await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Transfer on hold" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "The bank is holding this transfer for a security check. It will complete or be refunded — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText(BANK_REFERENCE)).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Done", "Back to Home"]);
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(
      await screen.findByText(/^Your last transfer is still being checked/),
    ).toBeOnTheScreen();

    await act(() => jest.advanceTimersByTimeAsync(31_000));

    expect(
      await screen.findByText(
        /^Your transfer of RM 100\.00 to .+ was sent — money moved\.$/,
      ),
    ).toBeOnTheScreen();
    expect(
      screen.queryByText(/^Your last transfer is still being checked/),
    ).toBeNull();
  }),
);

it(
  "says a transfer to an inactive account was declined, with no money moved",
  scenarioTest("transfer.recipient_account_inactive", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/");
    await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Transfer declined" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText("The transfer was declined — no money moved."),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/quote this reference/)).toBeNull();
  }),
);

it(
  "says a processing transfer can take up to a business day, with the bank's reference to quote",
  scenarioTest("transfer.processing", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/");
    await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Transfer processing" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "It's usually instant, but can take up to one business day. The result will show here and in History — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText(BANK_REFERENCE)).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Done", "Back to Home"]);
  }),
);

it(
  "keeps the receipt of a transfer the bank completed when a later read of it fails",
  scenarioTest("transfer.completed", async () => {
    mswServer.use(
      http.get("*/transfers/:transferId", () =>
        HttpResponse.json(
          {
            error: {
              code: "NEW_BANK_CODE",
              message: "A code added after this app was built.",
            },
          },
          { status: 400 },
        ),
      ),
    );
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/");
    await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Transfer sent" }),
    ).toBeOnTheScreen();
    await waitFor(() => {
      expect(
        sentRequests.filter(({ method, url }) =>
          method === "GET" ? /\/transfers\/[\w-]+$/.test(url) : false,
        ),
      ).not.toHaveLength(0);
    });
    expect(
      screen.getByRole("header", { name: "Transfer sent" }),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/cannot be shown/)).toBeNull();
  }),
);

it(
  "keeps checking a processing transfer in place and shows the receipt once it completes, leaving nothing for the next launch to warn about",
  scenarioTest("transfer.processing", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/");
    await sendRm100FromHome();
    await finishOpeningScreen(
      await screen.findByRole("header", { name: "Transfer processing" }),
    );

    await act(() => jest.advanceTimersByTimeAsync(32_000));

    expect(
      await screen.findByRole("header", { name: "Transfer sent" }),
    ).toBeOnTheScreen();
    const relaunched = await relaunchAppAndWaitForItsLaunchChecks(view);
    expect(screen.queryByText(/^Your (last )?transfer/)).toBeNull();
    expect(relaunched.getPathname()).toBe("/");
  }),
);

it(
  "warns on Home at the next launch, instead of reopening the page, when the app closes while a processing transfer is being checked",
  scenarioTest("transfer.processing", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/");
    await sendRm100FromHome();
    await screen.findByRole("header", { name: "Transfer processing" });
    await act(() => jest.advanceTimersByTimeAsync(1_000));

    const relaunched = await relaunchAppAndWaitForItsLaunchChecks(view);

    expect(
      screen.getByText(/^Your last transfer is still being checked/),
    ).toBeOnTheScreen();
    expect(relaunched.getPathname()).toBe("/");
  }),
);

it(
  "says a processing transfer that ends unsuccessful didn't go through, with the money coming back",
  scenarioTest("transfer.refunded_after_processing", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/");
    await sendRm100FromHome();
    expect(
      await screen.findByRole("header", { name: "Transfer processing" }),
    ).toBeOnTheScreen();

    await act(() => jest.advanceTimersByTimeAsync(32_000));

    expect(
      await screen.findByRole("header", { name: "Transfer refunded" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "This transfer didn't go through. The money is being, or has been, returned to you automatically.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/quote this reference/)).toBeNull();
  }),
);

it("reports a transfer whose amount the app cannot read, and claims no outcome for it", async () => {
  const { created } = await startTestTransfer(10_000);
  mswServer.use(
    http.get("*/transfers/:transferId", () =>
      HttpResponse.json({
        transfer: {
          ...created.transfer,
          amount: { ...created.transfer.amount, currency: "USD" },
        },
      }),
    ),
  );
  await renderRoute("/");
  await act(() => {
    router.push({
      pathname: "/transfer/result/[transferId]",
      params: { transferId: created.transfer.transferId },
    });
  });

  expect(
    await screen.findByRole("header", { name: "Outcome not confirmed" }),
  ).toBeOnTheScreen();
  expect(observedRecords).toContainEqual({
    type: "event",
    name: "unreadable_amount",
    properties: { boundary: "transfer" },
  });
});

it("fades into a sent transfer's result and shows its outcome and tick at once when the phone reduces motion", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await turnOnPhoneReduceMotion();
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await screen.findByRole("button", { name: "Transfer" });
  const reduceMotionOfAnimations = watchReduceMotionOfAnimations();
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

  const outcome = await screen.findByText("Transfer sent");
  // The stack hands its transition to each native screen as this prop; nothing else of it renders in Jest.
  const screenTransitions: unknown[] = [];
  for (let host = outcome.parent; host !== null; host = host.parent)
    if (host.props.stackAnimation !== undefined)
      screenTransitions.push(host.props.stackAnimation);
  expect([...new Set(screenTransitions)]).toEqual(["fade"]);
  expect(outcome).toBeVisible();
  expect([...new Set(reduceMotionOfAnimations())]).toEqual([
    ReduceMotion.Always,
  ]);
});

const t = getFixedT(null, ["shared"]);
const BANK_REFERENCE =
  /^If you contact us, quote this reference: \d{8}[\dA-F]{8}$/;
