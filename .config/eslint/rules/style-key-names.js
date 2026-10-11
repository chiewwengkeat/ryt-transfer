const {
  isComponentName,
  isComponentTsxFile,
  isFnExpr,
  isStyleSheetCreate,
  memoOrForwardRefName,
} = require("./_component");

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "A style key names what it styles: `main` on a component's outermost element and on no " +
        "other, `text…` on a text element, `btn…` on a pressable, and neither prefix on any other " +
        "element.",
    },
    messages: {
      rootNotMain:
        "This is {{component}}'s outermost element, so its style is `main`, not `{{key}}`. A style beside `main` there is named for its condition alone, as `pressed`.",
      mainBelowRoot:
        "`main` names a component's outermost element and no other. Name this style for the element it styles.",
      textKey:
        "`{{key}}` styles a text element, so it starts with `text`: `{{suggestion}}`.",
      btnKey:
        "`{{key}}` styles a pressable, so it starts with `btn`: `{{suggestion}}`.",
      otherKey:
        "`{{key}}` styles neither a text element nor a pressable, so it starts with neither `text` nor `btn`.",
      buttonWord:
        "`{{key}}` says button twice: the `btn` prefix replaces the word, as `{{suggestion}}`.",
      sharedMain:
        "This sheet's `main` already styles {{owner}}'s outermost element. Give {{component}} a sheet of its own, `{{suggestion}}`.",
    },
    schema: [],
  },
  create(context) {
    if (!isComponentTsxFile(context)) return {};
    const { sourceCode } = context;
    const report = (node, messageId, data) =>
      context.report({ node, messageId, data });
    const elements = [];
    return {
      JSXElement(element) {
        elements.push(element);
      },
      "Program:exit"(program) {
        const accesses = sheetAccesses(sourceCode, program);
        if (accesses.size === 0) return;
        const keysOf = new Map();
        for (const element of elements) {
          const keys = keysOnElement(sourceCode, element, accesses);
          if (keys.length > 0) keysOf.set(element, keys);
        }
        const roots = rootElements(sourceCode, program, keysOf);
        const mainOwners = new Map();
        for (const [element, keys] of keysOf) {
          const component = roots.get(element);
          if (component === undefined) reportBelowRoot(report, element, keys);
          else reportRoot(report, component, keys, mainOwners);
          for (const { node, key } of keys)
            if (BTN_KEY.test(key) && key.includes("Button"))
              report(node, "buttonWord", { key, suggestion: btnName(key) });
        }
      },
    };
  },
};

const TEXT_KEY = /^text(?=[A-Z]|$)/;
const BTN_KEY = /^btn(?=[A-Z]|$)/;
const STYLE_ATTRIBUTE = /^(style|styles|[a-zA-Z]+Style)$/;

function sheetAccesses(sourceCode, program) {
  const accesses = new Map();
  for (const statement of program.body) {
    const declaration =
      statement.type === "ExportNamedDeclaration"
        ? statement.declaration
        : statement;
    if (!declaration || declaration.type !== "VariableDeclaration") continue;
    for (const declarator of declaration.declarations) {
      if (
        declarator.id.type !== "Identifier" ||
        !isStyleSheetCreate(declarator.init)
      )
        continue;
      const [sheet] = sourceCode.getDeclaredVariables(declarator);
      for (const { identifier } of sheet.references) {
        const access = identifier.parent;
        if (
          access.type === "MemberExpression" &&
          access.object === identifier &&
          !access.computed &&
          access.property.type === "Identifier"
        )
          accesses.set(access, { sheet, key: access.property.name });
      }
    }
  }
  return accesses;
}

function keysOnElement(sourceCode, element, accesses) {
  const keys = [];
  for (const attribute of element.openingElement.attributes) {
    if (
      attribute.type !== "JSXAttribute" ||
      attribute.name.type !== "JSXIdentifier" ||
      !STYLE_ATTRIBUTE.test(attribute.name.name)
    )
      continue;
    walk(sourceCode, attribute.value, (node) => {
      if (isJsx(node)) return false;
      const access = accesses.get(node);
      if (access) keys.push({ node, ...access });
      return true;
    });
  }
  return keys;
}

function rootElements(sourceCode, program, keysOf) {
  const roots = new Map();
  const isStyled = (element) => keysOf.has(element);
  for (const { name, fn } of componentsOf(program)) {
    const returned = ownReturns(sourceCode, fn);
    const outermost = returned.flatMap((node) =>
      outermostElements(node, isStyled),
    );
    // Only a component that renders nothing itself: elsewhere, JSX passed to a call is not its rendering.
    if (returned.length > 0 && returned.every(isNull))
      for (const node of handedOffJsx(sourceCode, fn.body))
        outermost.push(...outermostElements(node, isStyled));
    for (const element of outermost) roots.set(element, name);
  }
  return roots;
}

function reportRoot(report, component, keys, mainOwners) {
  const main = keys.filter(({ key }) => key === "main");
  if (main.length === 0)
    report(keys[0].node, "rootNotMain", { component, key: keys[0].key });
  for (const { node, sheet } of main) {
    const owner = mainOwners.get(sheet) ?? component;
    mainOwners.set(sheet, owner);
    const suggestion =
      component[0].toLowerCase() + component.slice(1) + "Styles";
    if (owner !== component)
      report(node, "sharedMain", { owner, component, suggestion });
  }
}

function reportBelowRoot(report, element, keys) {
  const kind = kindOf(tagName(element.openingElement.name));
  for (const { node, key } of keys) {
    if (key === "main") report(node, "mainBelowRoot");
    else if (kind === "text" && !TEXT_KEY.test(key))
      report(node, "textKey", { key, suggestion: "text" + upperFirst(key) });
    else if (kind === "btn" && !BTN_KEY.test(key))
      report(node, "btnKey", { key, suggestion: btnName(key) });
    else if (kind === "other" && (TEXT_KEY.test(key) || BTN_KEY.test(key)))
      report(node, "otherKey", { key });
  }
}

function componentsOf(program) {
  return program.body.flatMap((statement) => {
    const declaration = statement.type.startsWith("Export")
      ? statement.declaration
      : statement;
    if (declaration?.type === "VariableDeclaration")
      return declaration.declarations.flatMap(({ id, init }) => {
        const fn = componentFunction(init);
        return fn && id.type === "Identifier" && /^[A-Z]/.test(id.name)
          ? [{ name: id.name, fn }]
          : [];
      });
    const fn =
      declaration?.type === "FunctionDeclaration"
        ? declaration
        : componentFunction(declaration);
    const name = fn?.id ? fn.id.name : "";
    return fn && isComponentName(name)
      ? [{ name: name || "this component", fn }]
      : [];
  });
}

function componentFunction(node) {
  if (isFnExpr(node)) return node;
  if (node?.type === "CallExpression" && memoOrForwardRefName(node.callee))
    return componentFunction(node.arguments[0]);
  return null;
}

function ownReturns(sourceCode, fn) {
  if (fn.body.type !== "BlockStatement") return [fn.body];
  const returned = [];
  walk(sourceCode, fn.body, (node) => {
    if (isFnExpr(node) || node.type === "FunctionDeclaration") return false;
    if (node.type === "ReturnStatement") returned.push(node.argument);
    return true;
  });
  return returned;
}

function handedOffJsx(sourceCode, body) {
  const handedOff = [];
  walk(sourceCode, body, (node) => {
    if (isJsx(node)) return false;
    if (node.type === "CallExpression")
      handedOff.push(...node.arguments.filter(isJsx));
    return true;
  });
  return handedOff;
}

function outermostElements(node, isStyled) {
  switch (node?.type) {
    case "ConditionalExpression":
      return [
        ...outermostElements(node.consequent, isStyled),
        ...outermostElements(node.alternate, isStyled),
      ];
    case "LogicalExpression":
      return outermostElements(node.right, isStyled);
    case "JSXFragment":
      return onlyStyledSlot(node.children, isStyled);
    case "JSXElement":
      return isTransparent(node)
        ? onlyStyledSlot(node.children, isStyled)
        : [node];
    default:
      return [];
  }
}

/** With two styled slots, a fragment or provider has no outermost element of its own. */
function onlyStyledSlot(children, isStyled) {
  const styledSlots = slotsOf(children, isStyled)
    .map((slot) => slot.filter(isStyled))
    .filter((slot) => slot.length > 0);
  return styledSlots.length === 1 ? styledSlots[0] : [];
}

function slotsOf(children, isStyled) {
  return children.flatMap((child) => {
    if (
      child.type === "JSXFragment" ||
      (child.type === "JSXElement" && isTransparent(child))
    )
      return slotsOf(child.children, isStyled);
    if (child.type === "JSXElement") return [[child]];
    if (
      child.type === "JSXExpressionContainer" &&
      child.expression.type !== "JSXEmptyExpression"
    )
      return [outermostElements(child.expression, isStyled)];
    return [];
  });
}

function isTransparent(element) {
  const name = tagName(element.openingElement.name);
  return (
    name === "Fragment" ||
    name === "React.Fragment" ||
    /(Context|Provider)$/.test(name)
  );
}

function kindOf(name) {
  if (/^(Text|Animated\.Text)$|^Text[A-Z]/.test(name)) return "text";
  if (/^(Pressable|Animated\.Pressable)$|^Touchable|^Button[A-Z]/.test(name))
    return "btn";
  return "other";
}

function tagName(name) {
  return name.type === "JSXMemberExpression"
    ? tagName(name.object) + "." + name.property.name
    : String(name.name);
}

function btnName(key) {
  return (
    "btn" + upperFirst(key.replace(BTN_KEY, "").replace(/^button|Button/g, ""))
  );
}

function upperFirst(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function isJsx(node) {
  return node.type === "JSXElement" || node.type === "JSXFragment";
}

function isNull(node) {
  return !node || (node.type === "Literal" && node.value === null);
}

function walk(sourceCode, node, visit) {
  if (!node || !visit(node)) return;
  for (const key of sourceCode.visitorKeys[node.type] ?? []) {
    const child = node[key];
    if (Array.isArray(child))
      for (const item of child) walk(sourceCode, item, visit);
    else if (child && typeof child.type === "string")
      walk(sourceCode, child, visit);
  }
}
