import { TRANSFER_SCENARIOS } from "@/mocks/scenarios/transfer-scenarios";
import { AppLanguage } from "@/shared/i18n/i18n";
import { TRANSLATION_BUNDLES } from "@/shell/translations";

// Jest defines it; the app's types deliberately leave out Node's globals.
declare const __dirname: string;

const { readFileSync, readdirSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: "utf8") => string;
  readdirSync: (path: string, options: { recursive: true }) => string[];
}>("node:fs");

const SOURCE_ROOT = `${__dirname}/../..`;
const MATRIX = readFileSync(
  `${SOURCE_ROOT}/screens/transfer/scenarios/transfer.md`,
  "utf8",
);

const STEP_NAMES = [
  "Start",
  "Recipient",
  "Amount",
  "Review",
  "Approval",
  "Outcome",
  "Recovery",
];
const MONEY_STATES = [
  "no money moved",
  "money moved",
  "not confirmed yet",
  "money returned",
];
const REQUIRED_LABELS = ["When", "Money", "Shown as", "Tell them", "They can"];
const OPTIONAL_LABELS = ["Never", "Afterwards", "Why"];

const [matrixHeader = "", ...stepChunks] = MATRIX.split(/^## /m);
const parsedSteps = stepChunks.map((chunk) => {
  const [stepName = "", ...sectionChunks] = chunk.split(/^### /m);
  return {
    name: stepName.trim(),
    sections: sectionChunks.map((section) => {
      const [heading = "", idLine = "", ...body] = section.trim().split("\n");
      return {
        heading,
        id: /^`([^`]+)`$/.exec(idLine)?.[1] ?? `(no id under ${heading})`,
        labels: body.flatMap((line) => {
          const [, name, value] =
            /^[-*] \*\*([^*]+):\*\* (.+)$/.exec(line) ?? [];
          return name && value ? [{ name, value }] : [];
        }),
      };
    }),
  };
});
const scenarioSections = parsedSteps.flatMap((step) => step.sections);
const MONEY_PHRASES = [
  ...matrixHeader.matchAll(/^\| ([a-z ]+) \| (\S[^|]*?) \| (\S[^|]*?) \|$/gm),
].map(([, english = "", malay = "", chinese = ""]) => ({
  [AppLanguage.English]: english,
  [AppLanguage.Malay]: malay,
  [AppLanguage.Chinese]: chinese,
}));
const RETRY_WORDS = [
  ...matrixHeader.matchAll(/^\| ([^|]+?) \| (\w+) \|$/gm),
].flatMap(([, word = "", languageName = ""]) => {
  const language = Object.entries(AppLanguage).find(
    ([name]) => name === languageName,
  )?.[1];
  return language === undefined ? [] : [{ word, language }];
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

// Mirrors GitHub's heading anchors, which the index links must match.
const anchorOf = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/ /g, "-");

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
        commonByLanguage[language]?.[id.replace(/^transfer\./, "")] ?? {},
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
        ({ name, value }) =>
          name === "Never" && value.startsWith("offer to send it again"),
      ),
    )
    .flatMap(({ id }) =>
      RETRY_WORDS.flatMap(({ word, language }) =>
        Object.entries(
          commonByLanguage[language]?.[id.replace(/^transfer\./, "")] ?? {},
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
    );
}

it("lists the seven steps in order", () => {
  expect(parsedSteps.map((step) => step.name)).toEqual(STEP_NAMES);
});

it("ends every step with its catch-all, and puts a catch-all nowhere else", () => {
  const misplaced = parsedSteps.flatMap((step) =>
    step.sections
      .filter(
        (section, position) =>
          section.heading.startsWith("Something unexpected") !==
          (position === step.sections.length - 1),
      )
      .map((section) => section.id),
  );

  expect(misplaced).toEqual([]);
});

it("gives every scenario a well-formed id of its own", () => {
  const ids = scenarioSections.map((section) => section.id);

  expect(
    ids.filter((id) => !/^transfer\.[a-z0-9]+(?:_[a-z0-9]+)*$/.test(id)),
  ).toEqual([]);
  expect(ids.filter((id, position) => ids.indexOf(id) !== position)).toEqual(
    [],
  );
});

it("keeps every heading unique, so each has an anchor of its own", () => {
  const anchors = [
    ...STEP_NAMES,
    ...scenarioSections.map((section) => section.heading),
  ].map(anchorOf);

  expect(
    anchors.filter((anchor, position) => anchors.indexOf(anchor) !== position),
  ).toEqual([]);
});

it("labels every scenario with each required label once, and nothing unknown", () => {
  const mislabelled = scenarioSections.flatMap((section) => {
    const names = section.labels.map((label) => label.name);
    const problems = [
      ...REQUIRED_LABELS.filter((name) => !names.includes(name)).map(
        (name) => `missing ${name}`,
      ),
      ...names
        .filter((name, position) => names.indexOf(name) !== position)
        .map((name) => `repeated ${name}`),
      ...names
        .filter(
          (name) =>
            !REQUIRED_LABELS.includes(name) && !OPTIONAL_LABELS.includes(name),
        )
        .map((name) => `unknown ${name}`),
    ];
    return problems.map((problem) => `${section.id}: ${problem}`);
  });

  expect(mislabelled).toEqual([]);
});

it("gives every scenario one of the four money states, each with its glossary phrases", () => {
  const outsideTheFour = scenarioSections
    .filter(
      (section) =>
        !MONEY_STATES.includes(
          section.labels.find((label) => label.name === "Money")?.value ?? "",
        ),
    )
    .map((section) => section.id);

  expect(MONEY_PHRASES.map((phrases) => phrases[AppLanguage.English])).toEqual(
    MONEY_STATES,
  );
  expect(outsideTheFour).toEqual([]);
});

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
        approval_cancelled: { body: "Approval cancelled. No money moved." },
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
        },
      },
      [AppLanguage.Chinese]: {
        biometrics_recognised: { title: "重试结果" },
      },
    }),
  ).toEqual([
    'transfer.outcome_unexpected en-MY load_again: "try again" in "TRY AGAIN"',
    'transfer.biometrics_recognised zh-MY title: "重试" in "重试结果"',
  ]);
});

it("puts no retry word on anything pressable where the matrix bans offering to send again", () => {
  const tryAgainOnEveryScenario = {
    [AppLanguage.English]: Object.fromEntries(
      scenarioSections.map(({ id }) => [
        id.replace(/^transfer\./, ""),
        { retry: "Try again" },
      ]),
    ),
  };

  expect(new Set(RETRY_WORDS.map(({ language }) => language))).toEqual(
    new Set(Object.values(AppLanguage)),
  );
  expect(
    findRetryWordsOnPressableLabels(scenarioSections, tryAgainOnEveryScenario),
  ).not.toEqual([]);
  expect(
    findRetryWordsOnPressableLabels(
      scenarioSections,
      REGISTERED_TRANSFER_COMMON,
    ),
  ).toEqual([]);
});

it("links every scenario once from the index, on its own step's line", () => {
  const indexLines = [
    ...matrixHeader.matchAll(/^[-*] \*\*([^*]+)\*\* · (.+)$/gm),
  ];
  const linkedSteps = indexLines.map(([, stepName = "", links = ""]) => ({
    step: stepName,
    links: [...links.matchAll(/\[([^\]]+)\]\(#([^)]+)\)/g)].map(
      ([, name, anchor]) => `${name} #${anchor}`,
    ),
  }));

  expect(linkedSteps).toEqual(
    parsedSteps.map((step) => ({
      step: step.name,
      links: step.sections.map(
        (section) => `${section.heading} #${anchorOf(section.heading)}`,
      ),
    })),
  );
});

it("gives the mock registry exactly the matrix's ids, each under its own step", () => {
  const registrySteps = Object.fromEntries(
    Object.entries(TRANSFER_SCENARIOS).map(([id, { step }]) => [id, step]),
  );

  expect(registrySteps).toEqual(
    Object.fromEntries(
      parsedSteps.flatMap((step) =>
        step.sections.map((section) => [section.id, step.name]),
      ),
    ),
  );
});

it("declares no scenario test for an id the matrix lacks", () => {
  const matrixIds = scenarioSections.map((section) => section.id);
  const declaredIds = readdirSync(SOURCE_ROOT, { recursive: true })
    .filter((file) => /\.test\.tsx?$/.test(file))
    .flatMap((file) =>
      [
        ...readFileSync(`${SOURCE_ROOT}/${file}`, "utf8").matchAll(
          /scenarioTest\(\s*["'`]([^"'`]+)["'`]/g,
        ),
      ].map(([, id = ""]) => id),
    );

  expect(declaredIds.filter((id) => !matrixIds.includes(id))).toEqual([]);
});
