import { buildSignedApprovalText } from "@/domains/transfer/api/approve-transfer/approve-transfer";

const REVIEWED_TRANSFER = {
  transferId: "trf_8c1f3a",
  challenge: "q7Rk2nVb0sXe",
  recipientRef: "ref_51d0",
  registeredName: "NUR AISYAH BINTI AHMAD",
  idValueMasked: "•••• 4567",
  bankCode: "MBB",
  amount: { minor: 12550, currency: "MYR" as const },
};

it("signs the reviewed details as JSON in the fixed key order", () => {
  expect(buildSignedApprovalText({ ...REVIEWED_TRANSFER, note: "Lunch" })).toBe(
    '{"format":"transfer-approval/1","transferId":"trf_8c1f3a","challenge":"q7Rk2nVb0sXe","recipientRef":"ref_51d0","registeredName":"NUR AISYAH BINTI AHMAD","idValueMasked":"•••• 4567","bankCode":"MBB","amountMinor":12550,"currency":"MYR","note":"Lunch"}',
  );
});

it("keeps the note's key as null when there is no note", () => {
  const expected = buildSignedApprovalText({
    ...REVIEWED_TRANSFER,
    note: null,
  });

  expect(expected).toMatch(/,"note":null}$/);
  expect(buildSignedApprovalText(REVIEWED_TRANSFER)).toBe(expected);
  expect(buildSignedApprovalText({ ...REVIEWED_TRANSFER, note: "" })).toBe(
    expected,
  );
});
