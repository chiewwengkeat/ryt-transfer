"use strict";
// Filename-keyed, so no parser — the `code` body is inert and the filename
// carries every case.

const { test } = require("node:test");
const { RuleTester } = require("eslint");

const singularRoleSuffix = require("./singular-role-suffix");

// node:test owns reporting and failure now. RuleTester's own describe/it shims
// would catch the assertion throw and log it, leaving the node:test case green.
RuleTester.describe = (_name, fn) => fn();
RuleTester.it = (_name, fn) => fn();

test("singular-role-suffix: a singular .type. suffix passes", () => {
  passes({ code: ok, filename: RECEIPT + "/SectionTransferDetails.type.ts" });
});

test("singular-role-suffix: a singular .helper. suffix passes", () => {
  passes({ code: ok, filename: RECEIPT + "/SectionTransferDetails.helper.ts" });
});

test("singular-role-suffix: a singular .test. suffix passes", () => {
  passes({ code: ok, filename: RECEIPT + "/SectionTransferDetails.test.tsx" });
});

test("singular-role-suffix: a file with no suffix at all passes", () => {
  passes({ code: ok, filename: RECEIPT + "/SectionTransferDetails.tsx" });
});

test("singular-role-suffix: a non-role segment such as .generated. passes", () => {
  passes({ code: ok, filename: S + "/shared/i18n/en-MY.generated.ts" });
});

test("singular-role-suffix: a content-hash segment passes", () => {
  passes({ code: ok, filename: S + "/shared/ui/index.Bx16ehp1.js" });
});

test("singular-role-suffix: a .d.ts declaration file passes", () => {
  passes({ code: ok, filename: S + "/shared/types/env.d.ts" });
});

test("singular-role-suffix: a plural types/ DIRECTORY passes — directories stay plural", () => {
  passes({ code: ok, filename: S + "/shared/lib/money/types/money.type.ts" });
});

test("singular-role-suffix: a plural hooks/ DIRECTORY passes", () => {
  passes({
    code: ok,
    filename: S + "/domains/transfer/hooks/use-transfer-status.ts",
  });
});

test("singular-role-suffix: a plural utils/ DIRECTORY passes", () => {
  passes({ code: ok, filename: S + "/shared/utils/format.util.ts" });
});

test("singular-role-suffix: a plural DIRECTORY named exactly like a banned suffix passes", () => {
  passes({ code: ok, filename: S + "/mocks/recipient.mock.ts" });
});

test("singular-role-suffix: a plural word as the STEM passes — only suffixes are read", () => {
  passes({ code: ok, filename: S + "/domains/transfer/types.ts" });
});

test("singular-role-suffix: the compound suffix foo.helper.test.ts passes — both segments singular", () => {
  passes({
    code: ok,
    filename: RECEIPT + "/SectionTransferDetails.helper.test.ts",
  });
});

test("singular-role-suffix: the compound suffix foo.route.test.tsx passes", () => {
  passes({
    code: ok,
    filename: S + "/test/routes/transfer-result.route.test.tsx",
  });
});

test("singular-role-suffix: a bare filename with no directory is inert", () => {
  passes({ code: ok, filename: "SectionTransferDetails.types.ts" });
});

test("singular-role-suffix: .types. reports and suggests .type.", () => {
  reports({
    code: ok,
    filename: RECEIPT + "/SectionTransferDetails.types.ts",
    errors: singular({
      file: "SectionTransferDetails.types.ts",
      plural: "types",
      singular: "type",
      fixed: "SectionTransferDetails.type.ts",
    }),
  });
});

test("singular-role-suffix: .tests. reports and suggests .test.", () => {
  reports({
    code: ok,
    filename: RECEIPT + "/SectionTransferDetails.tests.tsx",
    errors: singular({
      file: "SectionTransferDetails.tests.tsx",
      plural: "tests",
      singular: "test",
      fixed: "SectionTransferDetails.test.tsx",
    }),
  });
});

test("singular-role-suffix: .helpers. reports and suggests .helper.", () => {
  reports({
    code: ok,
    filename: RECEIPT + "/SectionTransferDetails.helpers.ts",
    errors: singular({
      file: "SectionTransferDetails.helpers.ts",
      plural: "helpers",
      singular: "helper",
      fixed: "SectionTransferDetails.helper.ts",
    }),
  });
});

test("singular-role-suffix: .configs. reports", () => {
  reports({
    code: ok,
    filename: S + "/shared/observability/logger.configs.ts",
    errors: singular({
      file: "logger.configs.ts",
      plural: "configs",
      singular: "config",
      fixed: "logger.config.ts",
    }),
  });
});

test("singular-role-suffix: .routes. reports", () => {
  reports({
    code: ok,
    filename: S + "/test/transfer-result.routes.test.tsx",
    errors: singular({
      file: "transfer-result.routes.test.tsx",
      plural: "routes",
      singular: "route",
      fixed: "transfer-result.route.test.tsx",
    }),
  });
});

test("singular-role-suffix: .mocks. reports", () => {
  reports({
    code: ok,
    filename: S + "/test/msw/recipient.mocks.ts",
    errors: singular({
      file: "recipient.mocks.ts",
      plural: "mocks",
      singular: "mock",
      fixed: "recipient.mock.ts",
    }),
  });
});

test("singular-role-suffix: .specs. reports", () => {
  reports({
    code: ok,
    filename: S + "/test/transfer.specs.ts",
    errors: singular({
      file: "transfer.specs.ts",
      plural: "specs",
      singular: "spec",
      fixed: "transfer.spec.ts",
    }),
  });
});

test("singular-role-suffix: .utils. reports", () => {
  reports({
    code: ok,
    filename: S + "/domains/transfer/api/list-banks/list-banks.utils.ts",
    errors: singular({
      file: "list-banks.utils.ts",
      plural: "utils",
      singular: "util",
      fixed: "list-banks.util.ts",
    }),
  });
});

test("singular-role-suffix: .constants. reports", () => {
  reports({
    code: ok,
    filename: S + "/screens/transfer/state/limits.constants.ts",
    errors: singular({
      file: "limits.constants.ts",
      plural: "constants",
      singular: "constant",
      fixed: "limits.constant.ts",
    }),
  });
});

test("singular-role-suffix: .styles. reports", () => {
  reports({
    code: ok,
    filename: S + "/shared/ui/ButtonPrimary/ButtonPrimary.styles.ts",
    errors: singular({
      file: "ButtonPrimary.styles.ts",
      plural: "styles",
      singular: "style",
      fixed: "ButtonPrimary.style.ts",
    }),
  });
});

test("singular-role-suffix: a plural in a compound suffix reports and fixes only that segment", () => {
  reports({
    code: ok,
    filename: RECEIPT + "/SectionTransferDetails.helpers.test.ts",
    errors: singular({
      file: "SectionTransferDetails.helpers.test.ts",
      plural: "helpers",
      singular: "helper",
      fixed: "SectionTransferDetails.helper.test.ts",
    }),
  });
});

test("singular-role-suffix: a plural in the SECOND suffix position reports", () => {
  reports({
    code: ok,
    filename: RECEIPT + "/SectionTransferDetails.helper.tests.ts",
    errors: singular({
      file: "SectionTransferDetails.helper.tests.ts",
      plural: "tests",
      singular: "test",
      fixed: "SectionTransferDetails.helper.test.ts",
    }),
  });
});

test("singular-role-suffix: two plural suffixes report once and the suggestion fixes both", () => {
  reports({
    code: ok,
    filename: RECEIPT + "/SectionTransferDetails.helpers.tests.ts",
    errors: singular({
      file: "SectionTransferDetails.helpers.tests.ts",
      plural: "helpers",
      singular: "helper",
      fixed: "SectionTransferDetails.helper.test.ts",
    }),
  });
});

test("singular-role-suffix: a plural DIRECTORY does not stop a plural FILENAME reporting", () => {
  reports({
    code: ok,
    filename: S + "/shared/lib/money/types/money.types.ts",
    errors: singular({
      file: "money.types.ts",
      plural: "types",
      singular: "type",
      fixed: "money.type.ts",
    }),
  });
});

test("singular-role-suffix: the message states the filename-only scope", () => {
  reports({
    code: ok,
    filename: RECEIPT + "/SectionTransferDetails.types.ts",
    errors: [
      {
        message:
          /FILENAMES ONLY: directory names stay plural \(types\/, hooks\/, utils\/\)/,
      },
    ],
  });
});

const ruleTester = new RuleTester();
const S = "/repo/src";
const RECEIPT = S + "/screens/transfer/components/SectionTransferDetails";
const ok = "const x = 1;";

function passes(testCase) {
  ruleTester.run("rule", singularRoleSuffix, {
    valid: [testCase],
    invalid: [],
  });
}
function reports(testCase) {
  ruleTester.run("rule", singularRoleSuffix, {
    valid: [],
    invalid: [testCase],
  });
}
function singular(data) {
  return [{ messageId: "singular", data }];
}
