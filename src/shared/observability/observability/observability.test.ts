import {
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error/transport-error";
import { observedRecords } from "@/test/doubles/native-doubles";
import type * as Observability from "./observability";
import { reportError, setObservabilitySink, trackEvent } from "./observability";

afterEach(() => {
  jest.restoreAllMocks();
  if (VARIANT_BEFORE_TESTS === undefined)
    delete process.env.EXPO_PUBLIC_APP_VARIANT;
  else process.env.EXPO_PUBLIC_APP_VARIANT = VARIANT_BEFORE_TESTS;
});

it("passes an event's amount and outcome to the sink", () => {
  trackEvent("transfer_outcome", {
    scenario: "transfer.sent",
    outcome: "sent",
    amountMinor: 5000,
    currency: "MYR",
  });

  expect(observedRecords).toEqual([
    {
      type: "event",
      name: "transfer_outcome",
      properties: {
        scenario: "transfer.sent",
        outcome: "sent",
        amountMinor: 5000,
        currency: "MYR",
      },
    },
  ]);
});

it("drops every property it was not told to allow, a recipient's name included", () => {
  trackEvent("recipient_confirmed", {
    registeredName: "Ahmad bin Ali",
    idValue: "0123456789",
    note: "rent",
    step: "recipient",
  });

  expect(observedRecords[0]?.properties).toEqual({ step: "recipient" });
});

it("drops an allowed property that carries an object", () => {
  trackEvent("transfer_outcome", {
    scenario: { registeredName: "Ahmad bin Ali" },
  });

  expect(observedRecords[0]?.properties).toEqual({});
});

it("reports an error by its name and transport failure, never its message", () => {
  reportError(
    new TransportError(TransportErrorKind.Http, 422, "INSUFFICIENT_FUNDS"),
    { step: "create" },
  );
  reportError(new Error("Could not send RM50.00 to Ahmad bin Ali"));

  expect(observedRecords).toEqual([
    {
      type: "error",
      name: "TransportError",
      properties: {
        step: "create",
        errorKind: "http",
        httpStatus: 422,
        errorCode: "INSUFFICIENT_FUNDS",
      },
    },
    { type: "error", name: "Error", properties: {} },
  ]);
});

it("drops every property it was not told to allow from a reported error too", () => {
  reportError(new Error("lost"), {
    step: "approve",
    accountNumber: "0123456789",
    registeredName: "Ahmad bin Ali",
  });

  expect(observedRecords[0]?.properties).toEqual({ step: "approve" });
});

it("sends nothing anywhere while no sink is set", () => {
  const logged = jest
    .spyOn(console, "info")
    .mockImplementation(() => undefined);
  setObservabilitySink(null);

  trackEvent("transfer_started");
  reportError(new Error("lost"));

  expect(observedRecords).toEqual([]);
  expect(logged).not.toHaveBeenCalled();
});

it.each([
  { what: "an event", observe: () => trackEvent("transfer_started") },
  { what: "an error", observe: () => reportError(new Error("lost")) },
])(
  "never passes a broken sink's failure to the code reporting $what",
  ({ observe }) => {
    setObservabilitySink(() => {
      throw new Error("sink broke");
    });

    expect(observe).not.toThrow();
  },
);

it("logs a development build's request and answer with the PIN and signature masked", async () => {
  const logged = jest
    .spyOn(console, "info")
    .mockImplementation(() => undefined);
  loadObservabilityBuiltAs("development");
  const send = observability.logRequestsInDevelopment(() =>
    Promise.resolve(Response.json({ transfer: { status: "completed" } })),
  );

  await send(
    new Request("https://bank.test/transfers/tr_1/approve", {
      method: "POST",
      body: JSON.stringify({ keyId: "key_1", signature: "MEUC", pin: "1357" }),
    }),
  );

  expect(logged).toHaveBeenCalledWith(
    "[request] POST /transfers/tr_1/approve 200",
    {
      request: { keyId: "key_1", signature: "[masked]", pin: "[masked]" },
      response: { transfer: { status: "completed" } },
    },
  );
});

it("logs a development build's failed request and hands its failure on", async () => {
  const logged = jest
    .spyOn(console, "info")
    .mockImplementation(() => undefined);
  const failure = new TypeError("Network request failed");
  loadObservabilityBuiltAs("development");
  const send = observability.logRequestsInDevelopment(() =>
    Promise.reject(failure),
  );

  await expect(
    send(new Request("https://bank.test/accounts/primary")),
  ).rejects.toBe(failure);
  expect(logged).toHaveBeenCalledWith(
    "[request] GET /accounts/primary failed",
    {
      request: undefined,
      failure,
    },
  );
});

it("never lets a broken log change a development build's answer or failure", async () => {
  jest.spyOn(console, "info").mockImplementation(() => {
    throw new Error("console broke");
  });
  const answer = Response.json({});
  const failure = new TypeError("Network request failed");
  loadObservabilityBuiltAs("development");
  const answers = observability.logRequestsInDevelopment(() =>
    Promise.resolve(answer),
  );
  const fails = observability.logRequestsInDevelopment(() =>
    Promise.reject(failure),
  );

  await expect(
    answers(new Request("https://bank.test/accounts/primary")),
  ).resolves.toBe(answer);
  await expect(
    fails(new Request("https://bank.test/accounts/primary")),
  ).rejects.toBe(failure);
});

it.each(["demo", "production"])(
  "logs no request in a %s build",
  async (variant) => {
    const logged = jest
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    loadObservabilityBuiltAs(variant);
    const send = observability.logRequestsInDevelopment(() =>
      Promise.resolve(Response.json({})),
    );

    await send(new Request("https://bank.test/accounts/primary"));

    expect(logged).not.toHaveBeenCalled();
  },
);

const VARIANT_BEFORE_TESTS = process.env.EXPO_PUBLIC_APP_VARIANT;
let observability: typeof Observability;

function loadObservabilityBuiltAs(variant: string) {
  process.env.EXPO_PUBLIC_APP_VARIANT = variant;
  jest.isolateModules(() => {
    observability = jest.requireActual<typeof Observability>("./observability");
  });
}
