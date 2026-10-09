import { screen } from "@testing-library/react-native";

import { renderRoute } from "./render/render-route";

jest.mock("@/mocks/demo-layer/demo-layer", () => {
  throw new Error("The fake bank's loader was touched.");
});

// Before setup's launch hook loads the shell: a variant left set in the shell would load the fake bank there.
delete process.env.EXPO_PUBLIC_APP_VARIANT;

afterEach(() => {
  delete process.env.EXPO_PUBLIC_APP_VARIANT;
});

// Isolated: setup has already loaded the launch, and a loaded module is handed back without running its gate again.
function launchShellBuiltAs(variant: string | undefined) {
  if (variant === undefined) delete process.env.EXPO_PUBLIC_APP_VARIANT;
  else process.env.EXPO_PUBLIC_APP_VARIANT = variant;
  const fetchMswIntercepts = globalThis.fetch;
  try {
    jest.isolateModules(() => {
      jest.requireActual("@/root/app-launch/app-launch");
    });
  } finally {
    // The launch loads expo afresh through the capture library, and expo installs its own fetch over msw's.
    globalThis.fetch = fetchMswIntercepts;
  }
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
