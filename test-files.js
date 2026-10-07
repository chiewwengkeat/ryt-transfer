// The one definition of a test file: Jest runs these, lint treats them as tests, and the
// placement check never counts them as users of what they import.
const TEST_FILES = [
  "src/**/*.test.{ts,tsx}",
  "src/**/*.spec.{ts,tsx}",
  "src/**/__tests__/**/*.{ts,tsx}",
];

// Handles the glob features the list above uses: **/, * and {a,b}.
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

function isTestFile(file) {
  return TEST_FILE_PATTERNS.some((pattern) => pattern.test(file));
}

module.exports = { TEST_FILES, isTestFile };
