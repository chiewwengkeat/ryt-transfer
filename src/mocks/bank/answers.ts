import { HttpResponse } from "msw";
import type { JsonBodyType } from "msw";

import type { WireMoney } from "@/shared/lib/money/money.type";

export function bankError<Code extends string>(
  status: number,
  code: Code,
  message: string,
) {
  return { status, body: { error: { code, message } } };
}

export function httpResponseFrom({ status, body }: BankAnswer) {
  return HttpResponse.json(body, { status });
}

export function wireMoney(minor: number): WireMoney {
  return { minor, currency: "MYR" };
}

export interface BankAnswer<Body extends JsonBodyType = JsonBodyType> {
  status: number;
  body: Body;
}
