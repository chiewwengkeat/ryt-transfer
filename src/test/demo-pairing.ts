import demoLayer from "@/mocks/demo-layer";

// The demo build pairs at launch; Jest runs as production, so a test that approves pairs first.
export function pairPhoneAsTheDemoLaunchDoes() {
  return demoLayer.pairPhoneAtFirstLaunch();
}
