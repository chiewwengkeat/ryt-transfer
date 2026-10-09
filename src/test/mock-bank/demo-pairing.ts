import demoLayer from "@/mocks/demo-layer/demo-layer";

// The demo build pairs at launch; Jest runs as production, so a test that approves pairs first.
export function pairPhoneAsTheDemoLaunchDoes() {
  return demoLayer.pairPhoneAtFirstLaunch();
}

// The scenario forgets only keys registered in an earlier millisecond than it began, and a 1 ms
// timer can fire within the same one, so this waits for the clock itself to move on.
export async function pairPhoneBeforeTheBankForgetsItsKeys() {
  await pairPhoneAsTheDemoLaunchDoes();
  const pairedAtMs = Date.now();
  while (Date.now() <= pairedAtMs) {
    await new Promise((resolve) => {
      setTimeout(resolve, 1);
    });
  }
}
