import type { WireMoney } from "@/shared/lib/money/money";

import type { Transfer } from "../get-transfer/get-transfer.type";

export interface ListTransfersQuery {
  limit?: number;
  cursor?: string;
}

export interface ListTransfersResponse {
  items: Transfer[];
  nextCursor: string | null;
  // One per Malaysian date this page touches, covering that whole day, not only this page's rows.
  days: { date: string; count: number; net: WireMoney }[];
}

export enum ListTransfersErrorCode {
  InvalidRequest = "INVALID_REQUEST",
}

export interface ListTransfersErrorResponse {
  error: { code: ListTransfersErrorCode; message: string };
}
