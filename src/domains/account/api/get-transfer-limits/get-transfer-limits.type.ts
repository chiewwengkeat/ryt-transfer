import type { WireMoney } from "@/shared/lib/money/money";

export interface GetTransferLimitsResponse {
  daily: { limit: WireMoney; usedToday: WireMoney; remaining: WireMoney };
  perTransferMax: WireMoney;
}

export enum GetTransferLimitsErrorCode {
  ServiceUnavailable = "SERVICE_UNAVAILABLE",
}

export interface GetTransferLimitsErrorResponse {
  error: { code: GetTransferLimitsErrorCode; message: string; until?: string };
}
