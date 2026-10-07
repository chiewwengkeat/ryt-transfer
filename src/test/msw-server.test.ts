import { http, HttpResponse } from "msw";

import { mswServer, unhandledRequests } from "./msw-server";

it("answers a request through the shared mock server", async () => {
  mswServer.use(
    http.get("https://api.example.test/accounts/primary", () =>
      HttpResponse.json({ balanceSen: 123456 }),
    ),
  );

  const response = await fetch("https://api.example.test/accounts/primary");

  expect(await response.json()).toEqual({ balanceSen: 123456 });
});

it("catches a request no handler answers, even for a .json path", async () => {
  await fetch("https://api.example.test/scenarios/unmocked.json");

  expect(unhandledRequests.splice(0)).toEqual([
    "GET https://api.example.test/scenarios/unmocked.json",
  ]);
});
