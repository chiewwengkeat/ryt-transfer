import type {
  LookupRecipientRequest,
  RecipientIdType,
} from "./lookup-recipient/lookup-recipient.type";

export const transferKeys = {
  all: ["transfers"] as const,
  detail: (transferId: string) => ["transfers", "detail", transferId] as const,
  historyAll: ["transfer-history"] as const,
  history: (filters: Record<string, string> = {}) =>
    ["transfer-history", filters] as const,
  recentRecipients: ["transfers", "recent-recipients"] as const,
  banks: ["transfers", "banks"] as const,
  // Off the transfers prefix: a broad refetch would mint a new recipient reference under an open review.
  lookupAll: ["recipient-lookup"] as const,
  lookup: (
    recipient: Extract<LookupRecipientRequest, { idType: RecipientIdType }>,
  ) => ["recipient-lookup", recipient.idType, recipient.idValue] as const,
};
