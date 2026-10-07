// The one definition of test code. Jest runs TEST_FILES; lint applies its test rules to both
// lists and lets both import the harness; the placement check never counts either as a user.
const TEST_FILES = [
  "src/**/*.test.{ts,tsx}",
  "src/**/*.spec.{ts,tsx}",
  "src/**/__tests__/**/*.{ts,tsx}",
];
const TEST_HELPER_FILES = [
  "src/test/**/*.{ts,tsx}",
  "src/**/test-utils.{ts,tsx}",
  "src/**/*.stories.{ts,tsx}",
];

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

const TEST_CODE_PATTERNS = [...TEST_FILES, ...TEST_HELPER_FILES].map(
  globToRegExp,
);

function isTestCode(file) {
  return TEST_CODE_PATTERNS.some((pattern) => pattern.test(file));
}

module.exports = { TEST_FILES, TEST_HELPER_FILES, isTestCode };
