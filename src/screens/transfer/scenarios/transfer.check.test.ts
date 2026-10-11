import { TRANSFER_SCENARIOS } from "@/mocks/scenarios/transfer-scenarios/transfer-scenarios";
import { AppLanguage } from "@/shared/i18n/i18n";
import { findRouteTestedScenarioIds } from "@/test/scenarios/find-route-tested-scenario-ids";
import {
  matrixHeader,
  MONEY_PHRASES,
  parsedSteps,
  RESEND_BAN,
  RETRY_WORDS,
  scenarioSections,
} from "./transfer.helper";

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

it("reads every row of the header's money and retry-word tables", () => {
  const rowsBelowTableHeadings = matrixHeader
    .split(/\n\s*\n/)
    .filter((paragraph) => paragraph.startsWith("|"))
    .flatMap((table) => table.trim().split("\n").slice(2));

  expect(rowsBelowTableHeadings).toHaveLength(
    MONEY_PHRASES.length + RETRY_WORDS.length,
  );
});

it("writes every money phrase ending a Tell them exactly as the money table writes it", () => {
  const endsWithAPhraseOnlyLoosely = (tellThem: string) => {
    const looseEnding = tellThem.toLowerCase().replace(/[\p{P}\p{S}\s]+$/u, "");
    return MONEY_PHRASES.map((phrases) => phrases[AppLanguage.English]).some(
      (phrase) => looseEnding.endsWith(phrase) && !tellThem.endsWith(phrase),
    );
  };

  expect(
    [
      "the transfer was declined — No money moved",
      "a reference to quote to support — not confirmed yet.",
      "the approval timed out — no money moved",
      "the time it completed in Malaysia time — money moved",
      "the registered name and bank",
    ].filter(endsWithAPhraseOnlyLoosely),
  ).toEqual([
    "the transfer was declined — No money moved",
    "a reference to quote to support — not confirmed yet.",
  ]);
  expect(
    scenarioSections
      .filter(({ labels }) =>
        labels.some(
          ({ name, value }) =>
            name === "Tell them" && endsWithAPhraseOnlyLoosely(value),
        ),
      )
      .map(({ id }) => id),
  ).toEqual([]);
});

it('starts every Never that speaks of sending again with "offer to send it again"', () => {
  const speaksOfResendingInOtherWords = (never: string) =>
    /resend|send.*again/i.test(never) && !never.startsWith(RESEND_BAN);

  expect(
    [
      "Offer to send it again",
      "offer to resend it",
      "Resend it for them",
      "approve anyway, or offer to send it again",
      "offer to send it again while the answer is awaited",
      "approve with the phone's own passcode",
    ].filter(speaksOfResendingInOtherWords),
  ).toEqual([
    "Offer to send it again",
    "offer to resend it",
    "Resend it for them",
    "approve anyway, or offer to send it again",
  ]);
  expect(
    scenarioSections
      .filter(({ labels }) =>
        labels.some(
          ({ name, value }) =>
            name === "Never" && speaksOfResendingInOtherWords(value),
        ),
      )
      .map(({ id }) => id),
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

it("gives every scenario a route test that names it and asserts", () => {
  const routeTestedIds = new Set(
    readdirSync(SOURCE_ROOT, { recursive: true })
      .filter((file) => /\.tsx?$/.test(file))
      .flatMap((file) =>
        findRouteTestedScenarioIds(
          `src/${file}`,
          readFileSync(`${SOURCE_ROOT}/${file}`, "utf8"),
        ),
      ),
  );

  expect(
    scenarioSections
      .map((section) => section.id)
      .filter((id) => !routeTestedIds.has(id)),
  ).toEqual([]);
});

// Jest defines it; the app's types deliberately leave out Node's globals.
declare const __dirname: string;

const { readFileSync, readdirSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: "utf8") => string;
  readdirSync: (path: string, options: { recursive: true }) => string[];
}>("node:fs");

const SOURCE_ROOT = `${__dirname}/../../..`;

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

// Mirrors GitHub's heading anchors, which the index links must match.
const anchorOf = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/ /g, "-");
