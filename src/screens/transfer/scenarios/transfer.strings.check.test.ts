import {
  scenarioWordsKey,
  type TransferScenarioId,
} from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { TRANSLATION_BUNDLES } from "@/root/translations/translations";
import { AppLanguage } from "@/shared/i18n/i18n";

import {
  MONEY_PHRASES,
  RESEND_BAN,
  RETRY_WORDS,
  scenarioSections,
} from "./transfer.helper";

it("flags a money message without its state's phrase, in each language", () => {
  const sections = [
    {
      heading: "Approval cancelled",
      id: "transfer.approval_cancelled",
      labels: [
        { name: "Tell them", value: "it was cancelled; no money moved" },
      ],
    },
    {
      heading: "Transfer completed",
      id: "transfer.completed",
      labels: [{ name: "Tell them", value: "it arrived; money moved" }],
    },
    {
      heading: "Recipient found",
      id: "transfer.recipient_found",
      labels: [{ name: "Tell them", value: "the registered name" }],
    },
  ];

  expect(
    findMoneyMessagesWithoutTheirPhrase(sections, {
      [AppLanguage.English]: {
        approval_cancelled: {
          title: "Approval cancelled",
          body: "Approval cancelled. No money moved.",
        },
        completed: { body: "No money moved." },
      },
      [AppLanguage.Malay]: {
        approval_cancelled: { body: "Kelulusan dibatalkan." },
        completed: { body: "Wang telah dipindahkan." },
      },
      [AppLanguage.Chinese]: {
        approval_cancelled: { body: "批准已取消，款项未转出。" },
        completed: { body: "款项已转出。" },
      },
    }),
  ).toEqual([
    'transfer.approval_cancelled ms-MY: no "tiada wang dipindahkan"',
    'transfer.completed en-MY: no "money moved"',
  ]);
});

it("carries each scenario's money phrase in one of its strings, in every language", () => {
  expect(findMoneyMessagesWithoutTheirPhrase(scenarioSections, {})).not.toEqual(
    [],
  );
  expect(
    findMoneyMessagesWithoutTheirPhrase(
      scenarioSections,
      REGISTERED_TRANSFER_COMMON,
    ),
  ).toEqual([]);
});

it("flags a retry word on anything pressable where the matrix bans offering to send again", () => {
  const sections = [
    {
      heading: "Something unexpected after sending",
      id: "transfer.outcome_unexpected",
      labels: [{ name: "Never", value: "offer to send it again" }],
    },
    {
      heading: "Face or fingerprint recognised",
      id: "transfer.biometrics_recognised",
      labels: [
        {
          name: "Never",
          value: "offer to send it again while the answer is awaited",
        },
      ],
    },
    {
      heading: "Face or fingerprint not recognised",
      id: "transfer.biometrics_not_recognised",
      labels: [
        { name: "Never", value: "approve with the phone's own passcode" },
      ],
    },
    {
      heading: "Approval cancelled",
      id: "transfer.approval_cancelled",
      labels: [{ name: "Money", value: "no money moved" }],
    },
  ];

  expect(
    findRetryWordsOnPressableLabels(sections, {
      [AppLanguage.English]: {
        outcome_unexpected: {
          body: "You shouldn't send it again.",
          load_again: "TRY AGAIN",
        },
        biometrics_not_recognised: { retry: "Try again" },
        approval_cancelled: { retry: "Try again" },
      },
      [AppLanguage.Malay]: {
        outcome_unexpected: {
          body_other: "Jangan hantar semula {{count}} pindahan.",
          retry: "Try again",
        },
      },
      [AppLanguage.Chinese]: {
        biometrics_recognised: { title: "重试结果" },
      },
    }),
  ).toEqual([
    'transfer.outcome_unexpected en-MY load_again: "try again" in "TRY AGAIN"',
    'transfer.outcome_unexpected ms-MY retry: "try again" in "Try again"',
    'transfer.biometrics_recognised zh-MY title: "重试" in "重试结果"',
  ]);
});

it("puts no retry word on a scenario's own labels where the matrix bans offering to send again", () => {
  const languagesWherePlantedWordsGoUnflagged = Object.values(
    AppLanguage,
  ).filter((language) => {
    const word = RETRY_WORDS.find((retry) => retry.language === language)?.word;
    const registeredWithTheWord = Object.fromEntries(
      Object.entries(REGISTERED_TRANSFER_COMMON[language] ?? {}).map(
        ([name, strings]) => [
          name,
          Object.fromEntries(
            Object.entries(strings).flatMap(([role, text]) =>
              typeof text === "string" ? [[role, `${text} ${word}`]] : [],
            ),
          ),
        ],
      ),
    );
    return (
      findRetryWordsOnPressableLabels(scenarioSections, {
        [language]: registeredWithTheWord,
      }).length === 0
    );
  });

  expect(new Set(RETRY_WORDS.map(({ language }) => language))).toEqual(
    new Set(Object.values(AppLanguage)),
  );
  expect(languagesWherePlantedWordsGoUnflagged).toEqual([]);
  expect(
    findRetryWordsOnPressableLabels(
      scenarioSections,
      REGISTERED_TRANSFER_COMMON,
    ),
  ).toEqual([]);
});

// Fail-closed: any role not named here counts as pressable, a new message role included.
const MESSAGE_ROLES = ["body"];
const REGISTERED_TRANSFER_COMMON = Object.fromEntries(
  Object.values(AppLanguage).map((language) => [
    language,
    TRANSLATION_BUNDLES[language].transfer.find((part) => "common" in part)
      ?.common,
  ]),
);

function findMoneyMessagesWithoutTheirPhrase(
  sections: typeof scenarioSections,
  commonByLanguage: Partial<
    Record<AppLanguage, Record<string, Record<string, string>>>
  >,
) {
  return sections.flatMap(({ id, labels }) => {
    const tellThem =
      labels.find(({ name }) => name === "Tell them")?.value ?? "";
    // "no money moved" contains "money moved", so the longer phrase wins, here and in each text.
    const [statePhrases] = MONEY_PHRASES.filter((phrases) =>
      tellThem.endsWith(phrases[AppLanguage.English]),
    ).sort(
      (one, other) =>
        other[AppLanguage.English].length - one[AppLanguage.English].length,
    );
    if (statePhrases === undefined) return [];
    return Object.values(AppLanguage).flatMap((language) => {
      const phrase = statePhrases[language].toLowerCase();
      const longerPhrases = MONEY_PHRASES.map((phrases) =>
        phrases[language].toLowerCase(),
      ).filter((other) => other !== phrase && other.includes(phrase));
      const phraseCarried = Object.values(
        commonByLanguage[language]?.[
          scenarioWordsKey(id as `${TransferScenarioId}`)
        ] ?? {},
      ).some((text) =>
        longerPhrases
          .reduce(
            (rest, longer) => rest.split(longer).join(" "),
            text.toLowerCase(),
          )
          .includes(phrase),
      );
      return phraseCarried
        ? []
        : [`${id} ${language}: no "${statePhrases[language]}"`];
    });
  });
}

function findRetryWordsOnPressableLabels(
  sections: typeof scenarioSections,
  commonByLanguage: Partial<
    Record<AppLanguage, Record<string, Record<string, string>>>
  >,
) {
  return sections
    .filter(({ labels }) =>
      labels.some(
        ({ name, value }) => name === "Never" && value.startsWith(RESEND_BAN),
      ),
    )
    .flatMap(({ id }) =>
      Object.values(AppLanguage).flatMap((language) =>
        RETRY_WORDS.flatMap(({ word }) =>
          Object.entries(
            commonByLanguage[language]?.[
              scenarioWordsKey(id as `${TransferScenarioId}`)
            ] ?? {},
          )
            .filter(
              ([role, text]) =>
                !MESSAGE_ROLES.includes(
                  role.replace(/_(zero|one|two|few|many|other)$/, ""),
                ) && text.toLowerCase().includes(word.toLowerCase()),
            )
            .map(
              ([role, text]) =>
                `${id} ${language} ${role}: "${word}" in "${text}"`,
            ),
        ),
      ),
    );
}
