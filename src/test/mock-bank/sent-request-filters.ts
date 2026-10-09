import { sentRequests } from "./msw-server";

export function transferWritesSent() {
  return sentRequests
    .filter(({ method }) => method === "POST")
    .map(({ url }) => new URL(url).pathname)
    .filter((path) => path.startsWith("/transfers"));
}

export function sentNameChecks() {
  return sentRequests.filter(({ url }) => url.endsWith("/recipients/lookup"));
}

export function readsOfTheBalance() {
  return sentRequests.filter(
    ({ method, url }) => method === "GET" && url.endsWith("/accounts/primary"),
  ).length;
}
