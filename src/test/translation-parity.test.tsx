import { render } from "@testing-library/react-native";
import i18next, { type Resource } from "i18next";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ViewDemo from "@/mocks/switcher/components/ViewDemo/ViewDemo";
import { AppLanguage } from "@/shared/i18n/i18n";

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
// Chinese it must say what `_other` says.
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
      <ViewDemo onResetDemo={jest.fn()}>{null}</ViewDemo>
    </SafeAreaProvider>,
  );

  expect(Object.keys(i18next.store.data[AppLanguage.English] ?? {})).toEqual(
    expect.arrayContaining([
      "common",
      "account",
      "approval",
      "home",
      "transfer",
      "demo",
    ]),
  );
  expect(findTranslationsOutOfStep(i18next.store.data)).toEqual([]);
});
