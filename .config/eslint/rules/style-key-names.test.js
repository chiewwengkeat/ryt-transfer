"use strict";

const { test } = require("node:test");
const { RuleTester } = require("eslint");
const { parser } = require("typescript-eslint");
const styleKeyNames = require("./style-key-names");

// node:test owns reporting and failure now. RuleTester's own describe/it shims
// would catch the assertion throw and log it, leaving the node:test case green.
RuleTester.describe = (_name, fn) => fn();
RuleTester.it = (_name, fn) => fn();

test("style-key-names: an outermost element takes main, its pressed state the condition alone", () => {
  passes(`
    export default function Chip({ label }: Props) {
      return (
        <Pressable style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
          <Text style={styles.textLabel}>{label}</Text>
        </Pressable>
      );
    }
  `);
});

test("style-key-names: below the outermost element, text takes text…, pressables btn…, views any other name", () => {
  passes(`
    export default function Row() {
      return (
        <View style={styles.main}>
          <Text style={styles.textName}>a</Text>
          <TextBody style={styles.textBody}>b</TextBody>
          <TextInput style={styles.textInput} />
          <Pressable style={styles.btnClose} />
          <ButtonPrimary style={styles.btn} />
          <View style={styles.dots} />
        </View>
      );
    }
  `);
});

test("style-key-names: each return path's outermost element takes main", () => {
  passes(`
    export default function Card({ failed }: Props) {
      if (failed) return <View style={styles.main} />;
      return busy ? <Loader /> : <Pressable style={styles.main} />;
    }
  `);
});

test("style-key-names: a fragment's one styled element is its outermost, a conditional slot included", () => {
  passes(`
    export default function ButtonLanguage() {
      return (
        <>
          <Pressable style={styles.main} />
          <BottomSheetLanguage />
        </>
      );
    }
  `);
  passes(`
    export default function History() {
      return (
        <Fragment>
          <Stack.Screen options={{}} />
          {/* note */}
          {loading ? <Loader /> : failed ? <ViewScreenFrame /> : <View style={styles.main}><View style={styles.outOfDate} /></View>}
        </Fragment>
      );
    }
  `);
});

test("style-key-names: a fragment with several styled elements has no outermost element", () => {
  passes(`
    export default function TextOutcome() {
      return (
        <React.Fragment>
          <TextHeading style={styles.textHeading}>a</TextHeading>
          <TextBody style={styles.textBody}>b</TextBody>
        </React.Fragment>
      );
    }
  `);
});

test("style-key-names: a context provider is looked through", () => {
  passes(`
    export default function Host({ children }: Props) {
      return (
        <HostContext value={host}>
          <View style={styles.main}>{children}</View>
          {sheets.map((sheet) => <Fragment key={sheet.id}>{sheet.node}</Fragment>)}
        </HostContext>
      );
    }
  `);
});

test("style-key-names: a component that renders nothing gives main to the JSX it hands off", () => {
  passes(`
    export default function SheetFrame() {
      useLayoutEffect(() => {
        host.showSheet(id, <View style={styles.main}><Pressable style={styles.btnBackdrop} /></View>);
      });
      return null;
    }
  `);
});

test("style-key-names: computed keys, optional chains and a parameter named styles", () => {
  passes(`
    export default function Banner({ tone }: Props) {
      return <View style={[styles.main, styles[tone]]}><Text style={styles?.textBody} /></View>;
    }
    function Chip({ styles }: ChipProps) {
      return <View><Text style={styles.label} /></View>;
    }
  `);
});

test("style-key-names: a test file is not checked", () => {
  ruleTester.run("rule", styleKeyNames, {
    valid: [
      {
        filename: S + "/shared/ui/Card/Card.test.tsx",
        code: withSheet("const x = <Text style={styles.name} />;"),
      },
    ],
    invalid: [],
  });
});

test("style-key-names: reports an outermost element not styled main", () => {
  reports(
    "export default function Loader() { return <View style={styles.container} />; }",
    [
      {
        messageId: "rootNotMain",
        data: { component: "Loader", key: "container" },
      },
    ],
  );
  reports(
    "export const Row = memo(function Row() { return <View style={styles.row} />; });",
    ["rootNotMain"],
  );
});

test("style-key-names: reports a fragment's, a provider's and a hand-off's outermost element not styled main", () => {
  reports(
    "export default function B() { return <><Pressable style={styles.button} /><Sheet /></>; }",
    ["rootNotMain"],
  );
  reports(
    "export default function H() { return <HostContext.Provider value={h}><View style={styles.layer} /></HostContext.Provider>; }",
    ["rootNotMain"],
  );
  reports(
    "export default function F() { useEffect(() => { show(<View style={styles.sheetLayer} />); }); return null; }",
    ["rootNotMain"],
  );
});

test("style-key-names: reports a text key without text…", () => {
  reports(
    "export default function R() { return <View style={styles.main}><Text style={[styles.name, d && styles.nameDisabled]} /></View>; }",
    [
      { messageId: "textKey", data: { key: "name", suggestion: "textName" } },
      "textKey",
    ],
  );
});

test("style-key-names: reports a pressable key without btn…, the btn prefix replacing a button word", () => {
  reports(
    "export default function R() { return <View style={styles.main}><Pressable style={styles.closeButton} /></View>; }",
    [
      {
        messageId: "btnKey",
        data: { key: "closeButton", suggestion: "btnClose" },
      },
    ],
  );
  reports(
    "export default function R() { return <View style={styles.main}><Pressable style={styles.btnCloseButton} /></View>; }",
    [
      {
        messageId: "buttonWord",
        data: { key: "btnCloseButton", suggestion: "btnClose" },
      },
    ],
  );
});

test("style-key-names: reports text… or btn… on any other element", () => {
  reports(
    "export default function R() { return <View style={styles.main}><View style={styles.textLabel} /><View style={styles.btnKey} /></View>; }",
    ["otherKey", "otherKey"],
  );
});

test("style-key-names: reports main below the outermost element", () => {
  reports(
    "export default function R() { return <View style={styles.main}><View style={styles.main} /></View>; }",
    ["mainBelowRoot"],
  );
  reports(
    "export default function R() { return <View style={styles.main}>{items.map((i) => { return <Text key={i} style={styles.main} />; })}</View>; }",
    ["mainBelowRoot"],
  );
  reports(
    "export default function R() { const key = () => <Pressable style={styles.main} />; return <View style={styles.main}>{key()}</View>; }",
    ["mainBelowRoot"],
  );
  reports(
    "export default function R() { return <List contentContainerStyle={styles.main} footer={<View style={styles.main} />} />; }",
    ["mainBelowRoot"],
  );
});

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const S = "/repo/src";
const F = S + "/shared/ui/Card/Card.tsx";

function withSheet(code) {
  return code + "\nconst styles = StyleSheet.create({});";
}
function passes(code) {
  ruleTester.run("rule", styleKeyNames, {
    valid: [{ filename: F, code: withSheet(code) }],
    invalid: [],
  });
}
function reports(code, errors) {
  ruleTester.run("rule", styleKeyNames, {
    valid: [],
    invalid: [
      {
        filename: F,
        code: withSheet(code),
        errors: errors.map((error) =>
          typeof error === "string" ? { messageId: error } : error,
        ),
      },
    ],
  });
}
