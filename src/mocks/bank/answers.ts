import { HttpResponse } from "msw";
import type { JsonBodyType } from "msw";

import type { WireMoney } from "@/shared/lib/money/money.type";

export interface BankAnswer {
  status: number;
  body: JsonBodyType;
}

export function bankError(
  status: number,
  code: string,
  message: string,
  extras: Record<string, unknown> = {},
): BankAnswer {
  return { status, body: { error: { code, message, ...extras } } };
}

export function httpResponseFrom({ status, body }: BankAnswer) {
  return HttpResponse.json(body, { status });
}

export function wireMoney(minor: number): WireMoney {
  return { minor, currency: "MYR" };
}
