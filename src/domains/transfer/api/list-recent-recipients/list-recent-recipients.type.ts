import type { WireMoney } from "@/shared/lib/money/money";

import type { RecipientIdType } from "../lookup-recipient/lookup-recipient.type";

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
