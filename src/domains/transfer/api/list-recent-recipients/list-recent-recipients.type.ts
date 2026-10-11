import type { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import type { WireMoney } from "@/shared/lib/money/money";

export interface ListRecentRecipientsResponse {
  items: {
    recentId: string;
    registeredName: string;
    idType: RecipientIdType;
    idValueMasked: string;
    bankName: string;
    lastAmount: WireMoney;
    lastSentAt: string;
  }[];
}
