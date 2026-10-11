import type { JsonBodyType } from "msw";
import { HttpResponse } from "msw";

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

export interface BankAnswer<Body extends JsonBodyType = JsonBodyType> {
  status: number;
  body: Body;
}
