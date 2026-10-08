import { screen } from "@testing-library/react-native";

import { renderRoute } from "./render-route";

const VARIANT_BEFORE_TESTS = process.env.EXPO_PUBLIC_APP_VARIANT;

jest.mock("@/mocks/demo-layer", () => {
  throw new Error("The fake bank's loader was touched.");
});

afterEach(() => {
  if (VARIANT_BEFORE_TESTS === undefined)
    delete process.env.EXPO_PUBLIC_APP_VARIANT;
  else process.env.EXPO_PUBLIC_APP_VARIANT = VARIANT_BEFORE_TESTS;
});

// Setup loads the shell before this file's mock exists, so its gate is run again here, under the mock.
function launchShellBuiltAs(variant: string | undefined) {
  if (variant === undefined) delete process.env.EXPO_PUBLIC_APP_VARIANT;
  else process.env.EXPO_PUBLIC_APP_VARIANT = variant;
  jest.isolateModules(() => {
    jest.requireActual("@/shell/app-launch");
  });
}

it("boots the app root as a build with no variant does, never loading the fake bank", async () => {
  launchShellBuiltAs(undefined);
  await renderRoute("/");

  expect(await screen.findByText("RM 12,845.50")).toBeOnTheScreen();
});

it("loads the fake bank in a demo build, which the boot above would fail on", () => {
  expect(() => {
    launchShellBuiltAs("demo");
  }).toThrow("The fake bank's loader was touched.");
});
