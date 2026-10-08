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
  lookup: (
    recipient: Extract<LookupRecipientRequest, { idType: RecipientIdType }>,
  ) => ["transfers", "lookup", recipient.idType, recipient.idValue] as const,
};
