import { p256 } from "@noble/curves/nist.js";
import { getResponse, http } from "msw";
import { setupServer } from "msw/node";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import type { GetTransferLimitsResponse } from "@/domains/account/api/get-transfer-limits/get-transfer-limits.type";
import type { RegisterApprovalKeysResponse } from "@/domains/approval/api/register-approval-keys/register-approval-keys.type";
import { buildSignedApprovalText } from "@/domains/transfer/api/approve-transfer/approve-transfer";
import type { ApproveTransferRequest } from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import type { CreateTransferResponse } from "@/domains/transfer/api/create-transfer/create-transfer.type";
import {
  RecipientIdType,
  type LookupRecipientResponse,
} from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import { handlersForActiveScenario } from "@/mocks/bank/bank";

export { clearTransferScenario, pickTransferScenario } from "@/mocks/bank/bank";

// Resolved per request, as a phone's demo layer does, so a mid-test scenario switch applies.
// Matching every request, it reports the unmatched ones itself: msw would pass them through.
export const mswServer = setupServer(
  http.all(
    "*",
    async ({ request }) =>
      (await getResponse(handlersForActiveScenario(), request)) ??
      recordUnhandledRequest(request),
  ),
);

// Cloned, so a test can still read the body after a handler has consumed the original.
export const sentRequests: Request[] = [];
mswServer.events.on("request:start", ({ request }) => {
  sentRequests.push(request.clone());
});

export const unhandledRequests: string[] = [];

export function recordUnhandledRequest(request: Request) {
  unhandledRequests.push(`${request.method} ${request.url}`);
  throw new Error(`No mock handler for ${request.method} ${request.url}`);
}

export function transferWritesSent() {
  return sentRequests
    .filter(({ method }) => method === "POST")
    .map(({ url }) => new URL(url).pathname)
    .filter((path) => path.startsWith("/transfers"));
}

export function sentNameChecks() {
  return sentRequests.filter(({ url }) => url.endsWith("/recipients/lookup"));
}

export function readsOfTheBalance() {
  return sentRequests.filter(
    ({ method, url }) => method === "GET" && url.endsWith("/accounts/primary"),
  ).length;
}

// A resolver that answers nothing hands the read on to the bank, once released.
export function holdTheNextTransferRead() {
  let releaseTransferRead = () => undefined as void;
  const transferReadHeld = new Promise<void>((release) => {
    releaseTransferRead = release;
  });
  mswServer.use(
    http.get(
      "*/transfers/:transferId",
      async () => {
        await transferReadHeld;
      },
      { once: true },
    ),
  );
  return releaseTransferRead;
}

export const BANK_ORIGIN = "https://bank.example.test";

export const P256_SPKI_PREFIX = (
  "3059301306072a8648ce3d020106082a8648ce3d030107034200".match(/../g) ?? []
).map((pair) => parseInt(pair, 16));
const PHONE_SECRET_KEYS = {
  possession: Uint8Array.from({ length: 32 }, (_, index) => index + 1),
  biometric: Uint8Array.from({ length: 32 }, (_, index) => 99 - index),
};
let writeNumber = 0;

export const base64Of = (bytes: Iterable<number>) =>
  btoa(String.fromCharCode(...bytes));

export async function sendToBank<ResponseBody>(
  method: "GET" | "POST",
  path: string,
  options: { body?: unknown; idempotencyKey?: string | null } = {},
) {
  writeNumber += 1;
  const idempotencyKey =
    options.idempotencyKey === undefined
      ? `test-write-${writeNumber}`
      : options.idempotencyKey;
  const response = await fetch(`${BANK_ORIGIN}${path}`, {
    method,
    headers:
      method === "POST" && idempotencyKey !== null
        ? { "Idempotency-Key": idempotencyKey }
        : {},
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return {
    status: response.status,
    body: (await response.json()) as ResponseBody,
  };
}

export async function readBankBalanceMinor() {
  const { body } = await sendToBank<GetPrimaryAccountResponse>(
    "GET",
    "/accounts/primary",
  );
  return body.balance.minor;
}

export async function readBankUsedTodayMinor() {
  const { body } = await sendToBank<GetTransferLimitsResponse>(
    "GET",
    "/transfer-limits",
  );
  return body.daily.usedToday.minor;
}

export function phonePublicKeySpki(kind: keyof typeof PHONE_SECRET_KEYS) {
  return base64Of([
    ...P256_SPKI_PREFIX,
    ...p256.getPublicKey(PHONE_SECRET_KEYS[kind], false),
  ]);
}

export async function pairTestPhone() {
  const { body } = await sendToBank<Required<RegisterApprovalKeysResponse>>(
    "POST",
    "/approval-keys",
    {
      body: {
        possessionPublicKey: phonePublicKeySpki("possession"),
        biometricPublicKey: phonePublicKeySpki("biometric"),
      },
    },
  );
  return body;
}

export async function lookUpTestRecipient(idValue = "012-345 6789") {
  const { body } = await sendToBank<LookupRecipientResponse>(
    "POST",
    "/recipients/lookup",
    { body: { idType: RecipientIdType.Mobile, idValue } },
  );
  return body;
}

export async function startTestTransfer(
  amountMinor: number,
  { idValue, note }: { idValue?: string; note?: string } = {},
) {
  const lookup = await lookUpTestRecipient(idValue);
  const { body: created } = await sendToBank<CreateTransferResponse>(
    "POST",
    "/transfers",
    {
      body: {
        recipientRef: lookup.recipientRef,
        amount: { minor: amountMinor, currency: "MYR" },
        ...(note && { note }),
      },
    },
  );
  return {
    lookup,
    created,
    approvalPath: `/transfers/${created.transfer.transferId}/approve`,
  };
}

// Signs what review showed, as the phone does: the bank must rebuild the same text to verify it.
export function signTestApproval(
  { lookup, created }: Awaited<ReturnType<typeof startTestTransfer>>,
  key: { kind: keyof typeof PHONE_SECRET_KEYS; keyId: string },
  tamperedAmountMinor?: number,
): ApproveTransferRequest {
  const signedText = buildSignedApprovalText({
    transferId: created.transfer.transferId,
    challenge: created.approval.challenge,
    recipientRef: lookup.recipientRef,
    registeredName: lookup.recipient.registeredName,
    idValueMasked: lookup.recipient.idValueMasked,
    bankCode: lookup.recipient.bankCode,
    amount: {
      ...created.transfer.amount,
      minor: tamperedAmountMinor ?? created.transfer.amount.minor,
    },
    note: created.transfer.note,
  });
  const signature = p256.sign(
    new TextEncoder().encode(signedText),
    PHONE_SECRET_KEYS[key.kind],
    { format: "der" },
  );
  return { keyId: key.keyId, signature: base64Of(signature) };
}

export interface BankErrorBody {
  error: {
    code: string;
    message: string;
    attemptsRemaining?: number;
    until?: string;
    reason?: string;
  };
}
