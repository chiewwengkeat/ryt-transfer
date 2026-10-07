import { TRANSFER_SCENARIOS } from "@/mocks/scenarios/transfer-scenarios";

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

// Mirrors GitHub's heading anchors, which the index links must match.
const anchorOf = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/ /g, "-");

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
  const glossaryStates = [
    ...matrixHeader.matchAll(/^\| ([a-z ]+) \| \S[^|]* \| \S[^|]* \|$/gm),
  ].map(([, state]) => state);
  const outsideTheFour = scenarioSections
    .filter(
      (section) =>
        !MONEY_STATES.includes(
          section.labels.find((label) => label.name === "Money")?.value ?? "",
        ),
    )
    .map((section) => section.id);

  expect(glossaryStates).toEqual(MONEY_STATES);
  expect(outsideTheFour).toEqual([]);
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
