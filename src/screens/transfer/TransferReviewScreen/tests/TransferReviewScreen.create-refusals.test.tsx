import type { GetTransferLimitsResponse } from "@/domains/account/api/get-transfer-limits/get-transfer-limits.type";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { mswServer } from "@/test/mock-bank/mock-bank";
import {
  pressHardwareBack,
  scenarioTest,
  walkToTransferReview,
} from "@/test/render/drive-app";
import { renderRoute } from "@/test/render/render-route";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { getFixedT } from "i18next";
import { http, HttpResponse } from "msw";
import {
  askBankToCreateRm100,
  countSent,
  RECIPIENT_MOBILE,
  waitForHomeToOfferTransfer,
} from "./TransferReviewScreen.helper";

afterEach(() => {
  jest.restoreAllMocks();
});

it("offers to try again or leave when the bank's answer to the transfer cannot be read", async () => {
  mswServer.use(
    http.post("*/transfers", () => HttpResponse.json({}, { status: 201 }), {
      once: true,
    }),
  );
  const view = await renderRoute("/transfer");
  await walkToTransferReview();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText(
      "Something unexpected stopped the transfer — no money moved.",
    ),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
  await pressHardwareBack();
  expect(view.getPathname()).toBe("/transfer/amount");
});

it("offers to try again or leave when something unexpected fails before the transfer is sent", async () => {
  await renderRoute("/transfer");
  await walkToTransferReview();
  jest
    .spyOn(
      jest.requireMock<{ randomUUID: () => string }>("expo-crypto"),
      "randomUUID",
    )
    .mockImplementationOnce(() => {
      throw new Error("Test.");
    });

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText(
      "Something unexpected stopped the transfer — no money moved.",
    ),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
  expect(countSent("POST", "/transfers")).toBe(0);
});

it(
  "says on review that the balance no longer covers the amount, reads it and the limits again, and leads back to the amount instead of offering Transfer",
  scenarioTest("transfer.balance_or_limit_short_at_confirmation", async () => {
    const view = await renderRoute("/transfer");
    await walkToTransferReview();
    const transferButton = await screen.findByRole("button", {
      name: "Transfer",
    });
    const balanceReadsBefore = countSent("GET", "/accounts/primary");

    await fireEvent.press(transferButton);

    expect(
      await screen.findByText(
        "Your balance no longer covers this amount. Go back to change it.",
      ),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toBe("/transfer/review");
    expect(screen.getByRole("button", { name: "Go back" })).toBeOnTheScreen();
    await waitFor(() => {
      expect(countSent("GET", "/accounts/primary")).toBeGreaterThan(
        balanceReadsBefore,
      );
    });
    expect(countSent("POST", "/approve")).toBe(0);
    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: "Change amount" }),
    );
    expect(view.getPathname()).toBe("/transfer/amount");
  }),
);

it.each(["DAILY_LIMIT_EXCEEDED", "ABOVE_PER_TRANSFER_MAX"])(
  "says the amount is over a limit when the bank answers Confirm with %s",
  async (code) => {
    mswServer.use(
      http.post("*/transfers", () =>
        HttpResponse.json(
          { error: { code, message: "Test." } },
          { status: 422 },
        ),
      ),
    );
    await renderRoute("/transfer");
    await walkToTransferReview();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        "This amount is now over one of your transfer limits. Go back to change it.",
      ),
    ).toBeOnTheScreen();
  },
);

it(
  "goes on to review when maintenance begins after today's limit loaded, and says there until when transfers are unavailable",
  scenarioTest("transfer.under_maintenance", async () => {
    const { body } = await askBankToCreateRm100();
    // Home's read lands before the maintenance begins; every read after meets it.
    mswServer.use(
      http.get(
        "*/transfer-limits",
        () =>
          HttpResponse.json({
            daily: {
              limit: { minor: 500_000, currency: "MYR" },
              usedToday: { minor: 0, currency: "MYR" },
              remaining: { minor: 500_000, currency: "MYR" },
            },
            perTransferMax: { minor: 5_000_000, currency: "MYR" },
          } satisfies GetTransferLimitsResponse),
        { once: true },
      ),
    );
    await renderRoute("/");
    await waitForHomeToOfferTransfer();
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    await fireEvent.changeText(
      await screen.findByLabelText("DuitNow mobile number"),
      RECIPIENT_MOBILE,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await fireEvent.changeText(
      await screen.findByLabelText("Amount (RM)"),
      "100",
    );
    // Lets the amount step's own read meet the maintenance: before it does, Review is enabled either way.
    await act(() => jest.advanceTimersByTimeAsync(1_000));
    expect(screen.getByRole("button", { name: "Review" })).toBeEnabled();
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        `Transfers are unavailable right now, until ${formatMalaysianDateTime(body.error.until ?? "", t)}.`,
      ),
    ).toBeOnTheScreen();
    expect(countSent("POST", "/approve")).toBe(0);
  }),
);

it.each([
  ["a time the app cannot read", { until: "soon" }],
  ["no time", {}],
])(
  "says transfers are unavailable without a time when the bank answers Confirm with maintenance and %s",
  async (_, untilField) => {
    mswServer.use(
      http.post("*/transfers", () =>
        HttpResponse.json(
          {
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Test.",
              ...untilField,
            },
          },
          { status: 503 },
        ),
      ),
    );
    await renderRoute("/transfer");
    await walkToTransferReview();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        "Transfers are unavailable right now. Try again later.",
      ),
    ).toBeOnTheScreen();
    expect(countSent("POST", "/approve")).toBe(0);
  },
);

it("reads today's limit again when the bank answers Confirm with maintenance, since Home reads maintenance off it", async () => {
  mswServer.use(
    http.post("*/transfers", () =>
      HttpResponse.json(
        { error: { code: "SERVICE_UNAVAILABLE", message: "Test." } },
        { status: 503 },
      ),
    ),
  );
  await renderRoute("/transfer");
  await walkToTransferReview();
  const transferButton = await screen.findByRole("button", {
    name: "Transfer",
  });
  const limitReadsBefore = countSent("GET", "/transfer-limits");

  await fireEvent.press(transferButton);

  await screen.findByText(
    "Transfers are unavailable right now. Try again later.",
  );
  await waitFor(() => {
    expect(countSent("GET", "/transfer-limits")).toBeGreaterThan(
      limitReadsBefore,
    );
  });
});

it(
  "says something unexpected stopped the transfer when the bank answers Confirm in a way the app does not know",
  scenarioTest("transfer.review_unexpected", async () => {
    await renderRoute("/transfer");
    await walkToTransferReview();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        "Something unexpected stopped the transfer — no money moved.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
  }),
);

it.each([
  [
    "AMOUNT_INVALID",
    "Amount (RM)",
    "The bank could not accept this amount.",
    "50",
  ],
  [
    "NOTE_INVALID",
    "Note (optional)",
    "The bank could not accept this note.",
    "Dinner",
  ],
])(
  "returns to the amount step when the bank answers Confirm with %s, and says so under that field until it changes",
  async (code, refusedField, refusal, changedValue) => {
    mswServer.use(
      http.post("*/transfers", () =>
        HttpResponse.json(
          { error: { code, message: "Test." } },
          { status: 422 },
        ),
      ),
    );
    const view = await renderRoute("/transfer");
    await walkToTransferReview({ note: "Lunch" });

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(await screen.findByHintText(refusal)).toBe(
      screen.getByLabelText(refusedField),
    );
    expect(view.getPathname()).toBe("/transfer/amount");
    expect(
      screen.queryByText(
        "The bank could not accept the amount or note as entered. Check them, then review again.",
      ),
    ).toBeNull();
    await fireEvent.changeText(
      screen.getByLabelText(refusedField),
      changedValue,
    );
    expect(screen.queryByHintText(refusal)).toBeNull();
  },
);

const t = getFixedT(null, ["shared"]);
