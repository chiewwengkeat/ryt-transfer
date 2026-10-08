import demoLayer from "@/mocks/demo-layer";
import * as config from "@/shared/config/config";
import { allowScreenCapture } from "@/shared/platform/screen-capture";
import * as appLaunch from "@/shell/app-launch";

// Every test in a file importing this runs as a demo build. Replaced in place, never mocked: jest-setup loads
// these modules before a test file's mocks register, and their importers read each export live.
const replacedExports: { restore: () => void }[] = [];

beforeEach(() => {
  replacedExports.push(
    jest.replaceProperty(config, "isProductionBuild", false),
    jest.replaceProperty(appLaunch, "demoLayer", demoLayer),
  );
  // A demo launch leaves capture allowed, where Jest's launch ran as production and blocked it.
  return allowScreenCapture();
});

afterEach(() => {
  for (const replaced of replacedExports.splice(0)) replaced.restore();
});
