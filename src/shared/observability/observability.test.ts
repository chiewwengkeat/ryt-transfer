import { TransportError, TransportErrorKind } from "@/shared/http/transport";
import { observedRecords } from "@/test/harness/recording-sink";

import { reportError, setObservabilitySink, trackEvent } from "./observability";

it("passes an event's amount and outcome to the sink", () => {
  trackEvent("transfer_outcome", {
    scenario: "transfer.sent",
    amountMinor: 5000,
    currency: "MYR",
  });

  expect(observedRecords).toEqual([
    {
      type: "event",
      name: "transfer_outcome",
      properties: {
        scenario: "transfer.sent",
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

it("sends nothing anywhere while no sink is set", () => {
  setObservabilitySink(null);

  trackEvent("transfer_started");
  reportError(new Error("lost"));

  expect(observedRecords).toEqual([]);
});
