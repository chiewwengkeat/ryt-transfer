import { act, fireEvent, screen } from "@testing-library/react-native";
import { useMutation } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { http, HttpResponse } from "msw";
import { Pressable, Text } from "react-native";

import { requestJson } from "@/shared/http/transport/transport";
import {
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error/transport-error";
import { queryClient } from "@/root/query-client/query-client";

import { setPhoneNetwork } from "@/test/doubles/native-doubles";
import { mswServer, sentRequests } from "@/test/mock-bank/mock-bank";
import { renderRoute } from "./render-route";

it("reports the pathname the user navigated to", async () => {
  const view = await renderRoute("/", {
    _layout: () => <Stack />,
    index: () => (
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          // Relative: once Metro generates route types, only the app's real routes type-check.
          router.push("./details");
        }}
      >
        <Text>Open details</Text>
      </Pressable>
    ),
    details: () => <Text accessibilityRole="header">Details</Text>,
  });

  await fireEvent.press(screen.getByRole("button", { name: "Open details" }));

  expect(screen.getByRole("header", { name: "Details" })).toBeOnTheScreen();
  expect(view.getPathname()).toBe("/details");
});

// ⛔ Keep this after a test that renders a route: alone, it passes whatever renderRoute leaves on.
it("hands the next test real timers", async () => {
  const realTimerFired = await new Promise((resolve) => {
    setTimeout(() => resolve(true), 1);
  });

  expect(realTimerFired).toBe(true);
});

it("hands each test a query client of its own: this one leaves a balance behind", () => {
  queryClient.setQueryData(["balance"], "left behind");

  expect(queryClient.getQueryData(["balance"])).toBe("left behind");
});

// ⛔ Keep this right after the test above: alone, it passes against a client every test shares.
it("hands each test a query client of its own: this one finds no balance", () => {
  expect(queryClient.getQueryData(["balance"])).toBeUndefined();
});

it("keeps the app's retry rule, without its backoff", async () => {
  const queryFn = jest.fn(() =>
    Promise.reject(new TransportError(TransportErrorKind.Http, 503)),
  );

  await expect(
    queryClient.fetchQuery({ queryKey: ["balance"], queryFn }),
  ).rejects.toThrow(TransportError);

  expect(queryFn).toHaveBeenCalledTimes(3);
}, 1000);

it("keeps the app's write rule: a write goes once, at once, even offline", async () => {
  mswServer.use(http.post("*/write", () => HttpResponse.json({})));
  await renderRoute("/", {
    appDir: "src/app",
    overrides: { index: ScreenThatSendsAWrite },
  });
  await act(() => {
    setPhoneNetwork({ isConnected: false, isInternetReachable: false });
  });

  await fireEvent.press(screen.getByRole("button", { name: "Send" }));

  expect(await screen.findByRole("button", { name: "Sent" })).toBeOnTheScreen();
  expect(sentRequests.filter(({ url }) => url.endsWith("/write"))).toHaveLength(
    1,
  );
});

// Probed through the root's own behaviour, so the test outlives whatever the home route shows.
it("mounts the app's own routes and root layout when given none", async () => {
  await renderRoute("/");
  mswServer.use(
    http.get("*/any-request", () => new HttpResponse(null, { status: 401 })),
  );

  await act(async () => {
    await requestJson("/any-request").catch(() => undefined);
  });

  expect(
    screen.getByRole("header", { name: "Your session has ended" }),
  ).toBeOnTheScreen();
});

function ScreenThatSendsAWrite() {
  const write = useMutation({
    mutationFn: () => requestJson("/write", { method: "POST", body: {} }),
  });
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        write.mutate();
      }}
    >
      <Text>{write.isSuccess ? "Sent" : "Send"}</Text>
    </Pressable>
  );
}
