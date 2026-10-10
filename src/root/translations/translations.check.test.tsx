import { render } from "@testing-library/react-native";
import i18next, { type Resource } from "i18next";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  scenarioWordsKey,
  type TransferScenarioId,
} from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import ViewDemo from "@/mocks/switcher/components/ViewDemo/ViewDemo";
import type { initTranslations } from "@/shared/i18n/i18n";
import { AppLanguage } from "@/shared/i18n/i18n";

import { TRANSLATION_BUNDLES } from "./translations";

it("finds a top-level key that two bundles of one namespace both define", () => {
  expect(
    findKeysDefinedTwice({
      "en-MY": { transfer: [{ review: {}, amount: {} }, { review: {} }] },
    }),
  ).toEqual(["en-MY transfer:review"]);
});

it("registers no top-level key twice within a namespace", () => {
  expect(findKeysDefinedTwice(TRANSLATION_BUNDLES)).toEqual([]);
});

it("finds a Malay or Chinese plural whose `_one` twin is missing or differs", () => {
  expect(
    findPluralsWithoutEqualTwinInBundles({
      "en-MY": { common: [{ count_other: "{{count}} transfers" }] },
      "ms-MY": {
        common: [
          {
            history: {
              list: {
                count_other: "{{count}} pindahan",
                count_one: "{{count}} pindahan",
                nested_other: "{{count}} pindahan",
              },
            },
          },
          { missing_other: "{{count}} pindahan" },
        ],
      },
      "zh-MY": {
        common: [{ differs_other: "{{count}} 笔", differs_one: "一笔" }],
      },
    }),
  ).toEqual([
    "ms-MY common:history.list.nested_other",
    "ms-MY common:missing_other",
    "zh-MY common:differs_other",
  ]);
});

it("registers every Malay and Chinese plural with its `_one` twin", () => {
  expect(findPluralsWithoutEqualTwinInBundles(TRANSLATION_BUNDLES)).toEqual([]);
});

it("finds a missing key, a stray key, changed placeholders and an unregistered bundle", () => {
  expect(
    findTranslationsOutOfStep({
      "en-MY": {
        home: { title: "Home", remaining: "{{amount}} left for {{name}}" },
        demo: { pill: { label: "Demo" } },
      },
      "ms-MY": {
        home: { remaining: "Baki {{jumlah}} untuk {{name}}", stray: "Lagi" },
        demo: { pill: "Demo" },
      },
      "zh-MY": {
        home: { title: "首页", remaining: "{{name}} 还剩 {{amount}}" },
      },
    }),
  ).toEqual([
    "ms-MY home:title is missing",
    "ms-MY home:stray is not in English",
    "ms-MY home:remaining does not match English's placeholders",
    "ms-MY demo:pill.label is missing",
    "ms-MY demo:pill does not match English's placeholders",
    "zh-MY demo:pill is missing",
    "zh-MY demo:pill.label is missing",
  ]);
});

it("finds a Malay or Chinese plural whose `_one` says something other than its `_other`", () => {
  expect(
    findTranslationsOutOfStep({
      "en-MY": {
        demo: {
          list: {
            count_one: "{{count}} entry",
            count_other: "{{count}} entries",
          },
        },
      },
      "ms-MY": {
        demo: {
          list: {
            count_one: "{{count}} entri",
            count_other: "{{count}} entri",
          },
        },
      },
      "zh-MY": {
        demo: {
          list: { count_one: "{{count}} 项", count_other: "{{count}} 个条目" },
        },
      },
    }),
  ).toEqual(["zh-MY demo:list.count_other differs from its _one twin"]);
});

it("registers every English key in Malay and Chinese, with English's placeholders and equal plural twins", async () => {
  // The demo menu registers its strings when it first renders, not at launch.
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, right: 0, bottom: 0, left: 0 },
      }}
    >
      <ViewDemo appSheetOpen={false} onResetDemo={jest.fn()}>
        {null}
      </ViewDemo>
    </SafeAreaProvider>,
  );

  expect(Object.keys(i18next.store.data[AppLanguage.English] ?? {})).toEqual(
    expect.arrayContaining(["shared", "account", "home", "transfer", "demo"]),
  );
  expect(findTranslationsOutOfStep(i18next.store.data)).toEqual([]);
});

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
      scenarioWordsKey(id as `${TransferScenarioId}`),
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
        detail_rows: { status: "Status" },
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

// One namespace's bundles are spread together, so a top-level key two of them define keeps only one string.
function findKeysDefinedTwice(bundles: Parameters<typeof initTranslations>[0]) {
  const found: string[] = [];
  for (const [language, namespaces] of Object.entries(bundles))
    for (const [namespace, parts] of Object.entries(namespaces)) {
      const seen = new Set<string>();
      for (const key of parts.flatMap((part) => Object.keys(part))) {
        if (seen.has(key)) found.push(`${language} ${namespace}:${key}`);
        seen.add(key);
      }
    }
  return found;
}

function findPluralsWithoutEqualTwinInBundles(
  bundles: Parameters<typeof initTranslations>[0],
) {
  return Object.entries(bundles)
    .filter(([language]) => language !== "en-MY")
    .flatMap(([language, namespaces]) =>
      Object.entries(namespaces).flatMap(([namespace, parts]) =>
        parts.flatMap((part) =>
          findPluralsWithoutEqualTwin(part, `${language} ${namespace}:`),
        ),
      ),
    );
}

// Objects count as keys too, so a namespace registered empty, or not at all, still differs from English's.
function readPlaceholdersByKeyPath(
  strings: unknown,
  keyPrefix = "",
): [string, string | null][] {
  if (typeof strings !== "object" || strings === null) return [];
  return Object.entries(strings).flatMap(([key, value]: [string, unknown]) =>
    typeof value === "string"
      ? [
          [
            `${keyPrefix}${key}`,
            [...value.matchAll(/\{\{(.+?)\}\}/g)]
              .map(([, name]) => name)
              .sort()
              .join(),
          ],
        ]
      : [
          [`${keyPrefix}${key}`, null],
          ...readPlaceholdersByKeyPath(value, `${keyPrefix}${key}.`),
        ],
  );
}

// Hermes lacks Intl.PluralRules, so i18next reads `_one` for a count of 1 in every language: in Malay and
// Chinese it must say what `_other` says. Jest has the rules, so only a structural check sees it.
function findPluralsWithoutEqualTwin(
  strings: unknown,
  keyPrefix = "",
): string[] {
  if (typeof strings !== "object" || strings === null) return [];
  const stringsByKey = new Map<string, unknown>(Object.entries(strings));
  return [...stringsByKey].flatMap(([key, value]) => {
    if (typeof value !== "string")
      return findPluralsWithoutEqualTwin(value, `${keyPrefix}${key}.`);
    return key.endsWith("_other") &&
      stringsByKey.get(key.replace(/_other$/, "_one")) !== value
      ? [`${keyPrefix}${key}`]
      : [];
  });
}

function findTranslationsOutOfStep(registered: Resource) {
  const english = registered[AppLanguage.English] ?? {};
  return Object.values(AppLanguage)
    .filter((language) => language !== AppLanguage.English)
    .flatMap((language) => {
      const translated = registered[language] ?? {};
      return [
        ...new Set([...Object.keys(english), ...Object.keys(translated)]),
      ].flatMap((namespace) => {
        const englishPlaceholders = new Map(
          readPlaceholdersByKeyPath(english[namespace]),
        );
        const translatedPlaceholders = new Map(
          readPlaceholdersByKeyPath(translated[namespace]),
        );
        const where = `${language} ${namespace}:`;
        return [
          ...[...englishPlaceholders.keys()]
            .filter((keyPath) => !translatedPlaceholders.has(keyPath))
            .map((keyPath) => `${where}${keyPath} is missing`),
          ...[...translatedPlaceholders.keys()]
            .filter((keyPath) => !englishPlaceholders.has(keyPath))
            .map((keyPath) => `${where}${keyPath} is not in English`),
          ...[...englishPlaceholders]
            .filter(
              ([keyPath, placeholders]) =>
                translatedPlaceholders.has(keyPath) &&
                translatedPlaceholders.get(keyPath) !== placeholders,
            )
            .map(
              ([keyPath]) =>
                `${where}${keyPath} does not match English's placeholders`,
            ),
          ...findPluralsWithoutEqualTwin(translated[namespace]).map(
            (keyPath) => `${where}${keyPath} differs from its _one twin`,
          ),
        ];
      });
    });
}

// Jest defines it; the app's types deliberately leave out Node's globals.
declare const __dirname: string;

const { readFileSync, readdirSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: "utf8") => string;
  readdirSync: (path: string, options: { recursive: true }) => string[];
}>("node:fs");

const SOURCE_ROOT = `${__dirname}/../..`;
const BUNDLE_FILES = readdirSync(SOURCE_ROOT, { recursive: true }).filter(
  (file) => /(^|\/)i18n\/[^/]+\.json$/.test(file),
);
const MATRIX_IDS = [
  ...readFileSync(
    `${SOURCE_ROOT}/screens/transfer/scenarios/transfer.md`,
    "utf8",
  ).matchAll(/^### .+\n`(transfer\.[a-z0-9_]+)`$/gm),
].map(([, id = ""]) => id);
const WORDS_TWO_MODULES_SHARE = ["detail_rows", "close_sheet"];

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
      typeof demoBundle.common?.[
        scenarioWordsKey(id as `${TransferScenarioId}`)
      ]?.title !== "string",
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
