/* eslint-disable fe/file-layout -- a config file built at load */
const expoPreset = require("jest-expo/jest-preset");
const { TEST_FILES } = require("./.config/test-files");

const [presetAllowList, ...presetIgnorePatterns] =
  expoPreset.transformIgnorePatterns;

// Jest's workers inherit this process's environment, so every suite runs in UTC.
process.env.TZ = "UTC";

module.exports = {
  preset: "jest-expo",
  roots: ["<rootDir>/src"],
  testMatch: TEST_FILES.map((glob) => `<rootDir>/${glob}`),
  // Route tests that walk a whole transfer, signing included, outran Jest's 5 s default in a parallel run under load.
  testTimeout: 15_000,
  setupFilesAfterEnv: [
    "<rootDir>/src/test/setup/jest-setup.ts",
    "<rootDir>/src/test/setup/demo-bank-setup.ts",
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
