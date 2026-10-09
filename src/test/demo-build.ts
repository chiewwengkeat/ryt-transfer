import demoLayer from "@/mocks/demo-layer";
import * as config from "@/shared/config/config";
import { allowScreenCapture } from "@/shared/platform/screen-capture";
import type * as AppLaunch from "@/root/app-launch/app-launch";

// ⛔ Import this before anything that loads the shell: a launch already loaded is handed back, run as production's.
// Launched here, before jest-setup's hook can, so its load-time code runs as a demo build's does. Its demo layer still
// loads as null, since the variant is read from the environment: requests go through msw, and each test pairs the phone.
const launchingAsDemo = jest.replaceProperty(
  config,
  "isProductionBuild",
  false,
);
const appLaunch = jest.requireActual<typeof AppLaunch>(
  "@/root/app-launch/app-launch",
);
launchingAsDemo.restore();

// Replaced in place, never mocked: config loads with jest-setup, before a mock here could register, and importers
// read each export live.
const replacedExports: { restore: () => void }[] = [];

beforeEach(() => {
  replacedExports.push(
    jest.replaceProperty(config, "isProductionBuild", false),
    jest.replaceProperty(appLaunch, "demoLayer", demoLayer),
  );
});

// After jest-setup's reset, which leaves capture blocked as a production launch does.
afterEach(() => {
  for (const replaced of replacedExports.splice(0)) replaced.restore();
  return allowScreenCapture();
});
