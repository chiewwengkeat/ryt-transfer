import type { ListRecentRecipientsResponse } from "@/domains/transfer/api/list-recent-recipients/list-recent-recipients.type";
import {
  RecipientIdType,
  type LookupRecipientResponse,
} from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import {
  lookUpTestRecipient,
  pairTestPhone,
  sendToBank,
  signTestApproval,
  startTestTransfer,
  type BankErrorBody,
} from "@/test/mock-bank/bank-client";

it("finds one registered recipient however a mobile number is written", async () => {
  const lookups = [
    await lookUpTestRecipient("012-345 6789"),
    await lookUpTestRecipient("60123456789"),
    await lookUpTestRecipient("+60 12-345 6789"),
  ];

  expect(
    new Set(lookups.map(({ recipient }) => JSON.stringify(recipient))).size,
  ).toBe(1);
  expect(lookups[0]?.recipient).toMatchObject({
    idType: RecipientIdType.Mobile,
    idValueMasked: "•••• 6789",
  });
  expect(new Set(lookups.map(({ recipientRef }) => recipientRef)).size).toBe(3);
});

it("says a recipient is new until a transfer to them goes through", async () => {
  const { biometricKeyId } = await pairTestPhone();
  const before = await lookUpTestRecipient("019-876 5432");

  const started = await startTestTransfer(1_000, { idValue: "019-876 5432" });
  await sendToBank("POST", started.approvalPath, {
    body: signTestApproval(started, {
      kind: "biometric",
      keyId: biometricKeyId,
    }),
  });
  const after = await lookUpTestRecipient("019-876 5432");

  expect([before.firstTransfer, after.firstTransfer]).toEqual([true, false]);
});

it.each([
  [
    "an NRIC that is not 12 digits",
    { idType: RecipientIdType.Nric, idValue: "9001011234" },
    422,
    "INVALID_ID_FORMAT",
  ],
  [
    "a mobile number with too few digits",
    { idType: RecipientIdType.Mobile, idValue: "012-345" },
    422,
    "INVALID_ID_FORMAT",
  ],
  [
    "an account number without its bank",
    { idType: RecipientIdType.AccountNumber, idValue: "1234567890" },
    400,
    "INVALID_REQUEST",
  ],
])("refuses to look up %s", async (_, body, status, code) => {
  const refused = await sendToBank<BankErrorBody>(
    "POST",
    "/recipients/lookup",
    {
      body,
    },
  );

  expect([refused.status, refused.body.error.code]).toEqual([status, code]);
});

it("lists up to ten recent recipients, newest first and each once, each one found again by its id", async () => {
  const { body } = await sendToBank<ListRecentRecipientsResponse>(
    "GET",
    "/recipients/recent",
  );
  const [newest] = body.items;
  const found = await sendToBank<LookupRecipientResponse>(
    "POST",
    "/recipients/lookup",
    { body: { recentId: newest?.recentId } },
  );

  expect(body.items.length).toBeGreaterThan(1);
  expect(body.items.length).toBeLessThanOrEqual(10);
  expect(new Set(body.items.map(({ recentId }) => recentId)).size).toBe(
    body.items.length,
  );
  const sentTimes = body.items.map(({ lastSentAt }) => Date.parse(lastSentAt));
  expect(sentTimes).toEqual([...sentTimes].sort((left, right) => right - left));
  expect(found.body.recipient).toMatchObject({
    registeredName: newest?.registeredName,
    idValueMasked: newest?.idValueMasked,
  });
});
