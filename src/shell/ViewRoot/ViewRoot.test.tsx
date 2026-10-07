import { act, fireEvent, screen } from "@testing-library/react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";
import { DeviceEventEmitter, Pressable, Text } from "react-native";

import { requestJson } from "@/shared/http/transport";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";

// Jest runs as iOS, whose BackHandler ignores every listener: Android's lets a test press Back.
jest.mock("react-native/Libraries/Utilities/BackHandler", () =>
  jest.requireActual<object>(
    "react-native/Libraries/Utilities/BackHandler.android",
  ),
);

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

async function pressHardwareBack() {
  await act(() => {
    DeviceEventEmitter.emit("hardwareBackPress");
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

it("ignores hardware Back while the session-ended view covers the app, and obeys it after", async () => {
  const view = await renderRoute("/", {
    appDir: "src/app",
    overrides: {
      index: () => (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            router.push("./details");
          }}
        >
          <Text>Open details</Text>
        </Pressable>
      ),
      details: () => <Text>Details</Text>,
    },
  });
  await fireEvent.press(screen.getByRole("button", { name: "Open details" }));
  await endSessionWithAnyRequest();

  await pressHardwareBack();
  const pathnameUnderTheView = view.getPathname();
  await fireEvent.press(screen.getByRole("button", { name: "Sign in again" }));
  await pressHardwareBack();

  expect(pathnameUnderTheView).toBe("/details");
  expect(view.getPathname()).toBe("/");
});
