const expoPreset = require("jest-expo/jest-preset");

const { TEST_FILES } = require("./test-files");

const [presetAllowList, ...presetIgnorePatterns] =
  expoPreset.transformIgnorePatterns;

module.exports = {
  preset: "jest-expo",
  roots: ["<rootDir>/src"],
  testMatch: TEST_FILES.map((glob) => `<rootDir>/${glob}`),
  globalSetup: "<rootDir>/jest.global-setup.js",
  // Route tests that walk a whole transfer, signing included, outran Jest's 5 s default in a parallel run under load.
  testTimeout: 15_000,
  setupFilesAfterEnv: [
    "<rootDir>/src/test/jest-setup.ts",
    "<rootDir>/src/test/demo-bank-setup.ts",
  ],
  // msw/node maps the react-native condition to null, so `node` must follow it.
  testEnvironmentOptions: {
    customExportConditions: ["require", "react-native", "node"],
  },
  // msw's dependencies ship ESM-only .mjs entry points, which jest-expo leaves untransformed.
  transform: { "\\.mjs$": expoPreset.transform["\\.[jt]sx?$"] },
  // jest-expo's first ignore pattern is its allow-list, a negative lookahead ending in "))".
  transformIgnorePatterns: [
    presetAllowList.replace(
      /\)\)$/,
      "|rettime|until-async|@open-draft|@noble))",
    ),
    ...presetIgnorePatterns,
  ],
};
