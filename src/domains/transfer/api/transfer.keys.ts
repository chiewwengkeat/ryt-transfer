import type { LookupRecipientInput } from "./lookup-recipient/lookup-recipient.type";

export const transferKeys = {
  all: ["transfers"] as const,
  detail: (transferId: string) => ["transfers", "detail", transferId] as const,
  pendingNotices: ["transfers", "pending"] as const,
  historyAll: ["transfer-history"] as const,
  history: (filters: Record<string, string> = {}) =>
    ["transfer-history", filters] as const,
  recentRecipients: ["transfers", "recent-recipients"] as const,
  banks: ["transfers", "banks"] as const,
  // Off the transfers prefix: a broad refetch would mint a new recipient reference under an open review.
  lookupAll: ["recipient-lookup"] as const,
  // One account number at two banks is two recipients.
  lookup: (recipient: LookupRecipientInput) =>
    [
      "recipient-lookup",
      recipient.idType,
      recipient.idValue,
      recipient.bankCode ?? null,
      recipient.recentId ?? null,
    ] as const,
};
