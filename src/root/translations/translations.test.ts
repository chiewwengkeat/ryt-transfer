import type { initTranslations } from "@/shared/i18n/i18n";

import { TRANSLATION_BUNDLES } from "./translations";

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

// Hermes lacks Intl.PluralRules, so i18next reads `_one` for a count of 1 in every language: a Malay or Chinese
// `_other` with no twin shows English. Jest has the rules, so only this structural check sees it.
function findPluralsWithoutTwin(
  bundles: Parameters<typeof initTranslations>[0],
) {
  const found: string[] = [];
  const visit = (node: Record<string, unknown>, path: string) => {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "object" && value !== null)
        visit(value as Record<string, unknown>, `${path}${key}.`);
      else if (
        key.endsWith("_other") &&
        node[key.replace(/_other$/, "_one")] !== value
      )
        found.push(`${path}${key}`);
    }
  };
  for (const [language, namespaces] of Object.entries(bundles))
    if (language !== "en-MY")
      for (const [namespace, parts] of Object.entries(namespaces))
        for (const part of parts) visit(part, `${language} ${namespace}:`);
  return found;
}

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
    findPluralsWithoutTwin({
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
  expect(findPluralsWithoutTwin(TRANSLATION_BUNDLES)).toEqual([]);
});
