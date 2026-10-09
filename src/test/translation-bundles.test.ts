// Jest defines it; the app's types deliberately leave out Node's globals.
declare const __dirname: string;

const { readFileSync, readdirSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: "utf8") => string;
  readdirSync: (path: string, options: { recursive: true }) => string[];
}>("node:fs");

const SOURCE_ROOT = `${__dirname}/..`;
const BUNDLE_FILES = readdirSync(SOURCE_ROOT, { recursive: true }).filter(
  (file) => /(^|\/)i18n\/[^/]+\.json$/.test(file),
);
const MATRIX_IDS = [
  ...readFileSync(
    `${SOURCE_ROOT}/screens/transfer/scenarios/transfer.md`,
    "utf8",
  ).matchAll(/^### .+\n`(transfer\.[a-z0-9_]+)`$/gm),
].map(([, id = ""]) => id);

// Raw text, never parsed: JSON.parse keeps only the last of a repeated key, so no parsed check sees one.
function findKeysRepeatedInOneObject(bundleText: string) {
  const repeated: string[] = [];
  const containers: { keysSeen: Set<string> | null; keyPrefix: string }[] = [];
  let lastKeyPath = "";
  for (const [token, keyColon] of bundleText.matchAll(
    /"(?:[^"\\]|\\.)*"(\s*:)?|[{}[\]]/g,
  )) {
    const innermost = containers.at(-1);
    if (token === "{" || token === "[") {
      const valueSuffix = token === "{" ? "." : "[].";
      containers.push({
        keysSeen: token === "{" ? new Set() : null,
        keyPrefix: innermost?.keysSeen
          ? `${lastKeyPath}${valueSuffix}`
          : (innermost?.keyPrefix ?? ""),
      });
    } else if (token === "}" || token === "]") containers.pop();
    else if (keyColon !== undefined && innermost?.keysSeen) {
      const key = JSON.parse(token.slice(0, -keyColon.length)) as string;
      lastKeyPath = `${innermost.keyPrefix}${key}`;
      if (innermost.keysSeen.has(key)) repeated.push(lastKeyPath);
      innermost.keysSeen.add(key);
    }
  }
  return repeated;
}

function findMatrixIdsWithoutStrings(transferBundle: {
  common?: Record<string, unknown>;
}) {
  return MATRIX_IDS.filter((id) => {
    const scenarioStrings =
      transferBundle.common?.[id.replace(/^transfer\./, "")];
    return typeof scenarioStrings !== "object" || scenarioStrings === null;
  });
}

it("finds a key repeated inside one object, at any depth", () => {
  expect(
    findKeysRepeatedInOneObject(`{
      "title": "Transfer",
      "review": { "title": "Review", "note": "Say \\"{\\" here", "title": "Check" },
      "amount": { "field": { "label": "Amount", "hint": "{{currency}}", "label": "RM" } },
      "steps": [{ "name": "Recipient", "name": "Amount" }],
      "title": "Send"
    }`),
  ).toEqual(["review.title", "amount.field.label", "steps[].name", "title"]);
});

it("leaves alone a key that sibling objects each use once", () => {
  expect(
    findKeysRepeatedInOneObject(`{
      "review": { "title": "Review", "field": { "label": "Note" } },
      "amount": { "title": "Amount", "field": { "label": "Amount" } }
    }`),
  ).toEqual([]);
});

it("repeats no key inside one object in any bundle", () => {
  const repeatedByFile = BUNDLE_FILES.flatMap((file) =>
    findKeysRepeatedInOneObject(
      readFileSync(`${SOURCE_ROOT}/${file}`, "utf8"),
    ).map((keyPath) => `${file} ${keyPath}`),
  );

  expect(BUNDLE_FILES).toContain("shared/i18n/en-MY.json");
  expect(repeatedByFile).toEqual([]);
});

it("finds a matrix id with no strings under the transfer bundle's common, whatever else common holds", () => {
  const missingId = "transfer.offline";
  const common = {
    ...Object.fromEntries(
      MATRIX_IDS.filter((id) => id !== missingId).map(
        (id) => [id.replace(/^transfer\./, ""), { title: id }] as const,
      ),
    ),
    section_transfer_details: { title: "Transfer details" },
  };

  expect(findMatrixIdsWithoutStrings({ common })).toEqual([missingId]);
});

it("gives every matrix id its strings under the transfer bundle's common", () => {
  const transferBundle = JSON.parse(
    readFileSync(`${SOURCE_ROOT}/domains/transfer/i18n/en-MY.json`, "utf8"),
  ) as Parameters<typeof findMatrixIdsWithoutStrings>[0];

  expect(findMatrixIdsWithoutStrings(transferBundle)).toEqual([]);
});
