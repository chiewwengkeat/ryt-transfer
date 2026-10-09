import type * as Config from "./config";

afterEach(() => {
  if (VARIANT_BEFORE_TESTS === undefined)
    delete process.env.EXPO_PUBLIC_APP_VARIANT;
  else process.env.EXPO_PUBLIC_APP_VARIANT = VARIANT_BEFORE_TESTS;
});

it.each([
  ["production", "production"],
  ["unset", undefined],
  ["empty", ""],
])("treats a build whose variant is %s as production", (_label, variant) => {
  expect(loadConfigBuiltAs(variant)?.isProductionBuild).toBe(true);
});

it.each(["demo", "development"])(
  "treats a %s build as one that is not production",
  (variant) => {
    expect(loadConfigBuiltAs(variant)?.isProductionBuild).toBe(false);
  },
);

it.each(["constructor", "__proto__", "toString"])(
  "refuses to start a build whose variant is %s",
  (variant) => {
    expect(() => loadConfigBuiltAs(variant)).toThrow("EXPO_PUBLIC_APP_VARIANT");
  },
);

const VARIANT_BEFORE_TESTS = process.env.EXPO_PUBLIC_APP_VARIANT;

function loadConfigBuiltAs(variant: string | undefined) {
  if (variant === undefined) delete process.env.EXPO_PUBLIC_APP_VARIANT;
  else process.env.EXPO_PUBLIC_APP_VARIANT = variant;
  let config: typeof Config | undefined;
  jest.isolateModules(() => {
    config = jest.requireActual<typeof Config>("./config");
  });
  return config;
}
