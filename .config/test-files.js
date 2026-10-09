// The one definition of test code. Jest runs TEST_FILES; lint applies its test rules to both
// lists and lets both import the harness; the placement check never counts either as a user.
// A repo check among TEST_FILES may also import src/mocks and src/root, and earns no matrix credit.
const TEST_FILES = [
  "src/**/*.test.{ts,tsx}",
  "src/**/*.spec.{ts,tsx}",
  "src/**/__tests__/**/*.{ts,tsx}",
];
const TEST_HELPER_FILES = [
  "src/test/**/*.{ts,tsx}",
  "src/**/tests/**/*.{ts,tsx}",
  "src/**/test-utils.{ts,tsx}",
  "src/**/*.stories.{ts,tsx}",
];
const CHECK_TEST_FILES = ["src/**/*.check.test.{ts,tsx}"];

function isTestFile(file) {
  return TEST_FILE_PATTERNS.some((pattern) => pattern.test(file));
}

function isTestCode(file) {
  return TEST_CODE_PATTERNS.some((pattern) => pattern.test(file));
}

function isCheckTest(file) {
  return CHECK_TEST_PATTERNS.some((pattern) => pattern.test(file));
}

module.exports = {
  TEST_FILES,
  TEST_HELPER_FILES,
  CHECK_TEST_FILES,
  isTestFile,
  isTestCode,
  isCheckTest,
};

// Handles the glob features the lists above use: **/, * and {a,b}.
function globToRegExp(glob) {
  const escapeLiteral = (text) => text.replace(/[.+^$()|[\]\\]/g, "\\$&");
  const segmentToRegExp = (segment) =>
    segment
      .split(/(\{[^}]*\}|\*)/)
      .map((token) => {
        if (token === "*") return "[^/]*";
        if (token.startsWith("{"))
          return `(?:${token.slice(1, -1).split(",").map(escapeLiteral).join("|")})`;
        return escapeLiteral(token);
      })
      .join("");
  return new RegExp(
    `^${glob.split("**/").map(segmentToRegExp).join("(?:.*/)?")}$`,
  );
}

const TEST_FILE_PATTERNS = TEST_FILES.map(globToRegExp);
const TEST_CODE_PATTERNS = [
  ...TEST_FILE_PATTERNS,
  ...TEST_HELPER_FILES.map(globToRegExp),
];
const CHECK_TEST_PATTERNS = CHECK_TEST_FILES.map(globToRegExp);
