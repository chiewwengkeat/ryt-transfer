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
const WORDS_TWO_MODULES_SHARE = ["section_transfer_details", "close_sheet"];

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

function findMatrixIdsWithoutTitle(demoBundle: {
  common?: Record<string, { title?: unknown }>;
}) {
  return MATRIX_IDS.filter(
    (id) =>
      typeof demoBundle.common?.[id.replace(/^transfer\./, "")]?.title !==
      "string",
  );
}

function findScenarioGroupsNamingNoMatrixId(transferBundle: {
  common?: Record<string, unknown>;
}) {
  return Object.keys(transferBundle.common ?? {}).filter(
    (key) =>
      !WORDS_TWO_MODULES_SHARE.includes(key) &&
      !MATRIX_IDS.includes(`transfer.${key}`),
  );
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

it("finds a matrix id with no title in the Demo menu's bundle, whether its group is missing or holds no title", () => {
  const [missingId = "", untitledId = ""] = MATRIX_IDS;
  const common = Object.fromEntries(
    MATRIX_IDS.filter((id) => id !== missingId).map((id) => [
      id.replace(/^transfer\./, ""),
      id === untitledId ? {} : { title: id },
    ]),
  );

  expect(findMatrixIdsWithoutTitle({ common })).toEqual([
    missingId,
    untitledId,
  ]);
});

it("gives every matrix id a title in the Demo menu's bundle", () => {
  const demoBundle = JSON.parse(
    readFileSync(`${SOURCE_ROOT}/mocks/switcher/i18n/en-MY.json`, "utf8"),
  ) as Parameters<typeof findMatrixIdsWithoutTitle>[0];

  expect(findMatrixIdsWithoutTitle(demoBundle)).toEqual([]);
});

it("finds a group under the transfer bundle's common that names no matrix id and holds no words two modules share", () => {
  expect(
    findScenarioGroupsNamingNoMatrixId({
      common: {
        offline: { body: "You're offline." },
        section_transfer_details: { status: "Status" },
        offline_before_rename: { body: "You're offline." },
      },
    }),
  ).toEqual(["offline_before_rename"]);
});

it("names a matrix id with every scenario group under the transfer bundle's common", () => {
  const transferBundle = JSON.parse(
    readFileSync(`${SOURCE_ROOT}/domains/transfer/i18n/en-MY.json`, "utf8"),
  ) as Parameters<typeof findScenarioGroupsNamingNoMatrixId>[0];

  expect(findScenarioGroupsNamingNoMatrixId(transferBundle)).toEqual([]);
});
