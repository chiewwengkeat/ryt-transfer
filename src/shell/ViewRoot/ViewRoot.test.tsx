import { act, fireEvent, screen } from "@testing-library/react-native";
import { useQuery } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { Text } from "react-native";

import { requestJson } from "@/shared/http/transport";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";

function HomeBalance() {
  const { data } = useQuery({
    queryKey: ["balance"],
    queryFn: () => requestJson<{ amount: string }>("/balance"),
  });
  return <Text>{data?.amount ?? "Loading balance"}</Text>;
}

function answerBalance(amount: string) {
  mswServer.use(http.get("*/balance", () => HttpResponse.json({ amount })));
}

async function endSessionWithAnyRequest() {
  mswServer.use(
    http.get("*/any-request", () => new HttpResponse(null, { status: 401 })),
  );
  await act(async () => {
    await requestJson("/any-request").catch(() => undefined);
  });
}

it("covers the app with the session-ended view when a request answers 401", async () => {
  answerBalance("RM 10.00");
  await renderRoute("/", {
    appDir: "src/app",
    overrides: { index: HomeBalance },
  });
  expect(await screen.findByText("RM 10.00")).toBeOnTheScreen();

  await endSessionWithAnyRequest();

  expect(
    screen.getByRole("header", { name: "Your session has ended" }),
  ).toBeOnTheScreen();
  expect(screen.queryByText("RM 10.00")).toBeNull();
  expect(
    screen.getByText("RM 10.00", { includeHiddenElements: true }),
  ).toBeOnTheScreen();
});

it("signs back in to the app it covered, with its data fetched again", async () => {
  answerBalance("RM 10.00");
  await renderRoute("/", {
    appDir: "src/app",
    overrides: { index: HomeBalance },
  });
  expect(await screen.findByText("RM 10.00")).toBeOnTheScreen();
  await endSessionWithAnyRequest();
  answerBalance("RM 25.00");

  await fireEvent.press(screen.getByRole("button", { name: "Sign in again" }));

  expect(
    screen.queryByRole("header", { name: "Your session has ended" }),
  ).toBeNull();
  expect(await screen.findByText("RM 25.00")).toBeOnTheScreen();
});
