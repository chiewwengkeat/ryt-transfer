# 012. Inline or a folder of its own

## Context

1. [Decision 011](011-low-mental-load.md) let a small piece with one consumer fold into that consumer's file
   1. For a component file, that put a helper component, hook or function below the component's styles, while the file stayed within 200 lines
   2. When the lint rule against it landed, thirteen pieces still sat folded in app component files: ten components, two hooks and a function
2. A fold was meant to remove a jump to another file; it moved the jump instead
   1. A reader of the parent who meets `<IconChevron />`, or a call to a folded hook, still leaves the code they're reading, finds the piece below the parent's styles, and comes back
   2. The jump is only harder to see: the file's name doesn't announce the piece, and the file reads longer than the component it's named for
3. Hooks hid the same jump in another shape
   1. A hook written for one component computes a value and returns it, so the logic sits in the hook's file and what the value renders sits in the component; a reader following one thing on screen crosses both
   2. Where the hook's name doesn't say what it computes, the reader has to open it to learn even that

## Decision

1. **Nothing folds into a component file**
   1. No component, hook or function sits at module level in a component file beside the component; constants, types, styles and contexts may stay
   2. A piece one component uses either inlines into that component's body or takes a folder of its own
   3. Module-into-module folds stand as 011 sets them, and a plain module keeps its private functions at its bottom
2. **Inline or a folder: size, then the reader's interest**
   1. A child readers rarely need inlines up to about 15 lines of its own function
   2. One they usually need inlines up to about 40, while the consumer stays within 200 lines
   3. Anything larger takes a folder of its own
   4. Size counts neither props nor styles; an inlined child's styles join its consumer's sheet
3. **A child with state or effects that renders conditionally or in a list never inlines**
   1. Its state resets when it unmounts, or belongs to one row of many; moved into its consumer, the state would outlive the child or be shared by every row
   2. State here is `useState`, `useReducer` or a ref the child owns, or an effect; a store or query read is not state, since it doesn't reset on unmount
4. **Logic that would otherwise leave a body as a hook or function takes the first shape that fits**
   1. A helper component in its own folder that also renders the value, styled by its consumer through `children` or a `styles` prop: the logic sits beside what it renders, where a hook returns a value its consumer must still place. It takes its folder even where the cut-offs would inline a child its size
   2. Inline, in the body
   3. An imported hook or function
5. **A hook or function is for what a component could hold only through a workaround or more plumbing**
   1. Logic run after a press, or in an effect, that renders nothing
   2. A value that two components in different places need
   3. A value that feeds logic at several places
   4. A hook wrapping one outside resource (a query or mutation, a store, a form, a platform API) stays a hook, and so does code that knows nothing about banking; any other hook, one wrapping several resources included, is judged by this test, hook by hook
6. **A jump to another file is fine when its name tells a first-time reader what the piece does without opening it**, as `approveWithPin` and `approveWithBiometricKey` do
   1. Short names are preferred: a longer name that still leaves the piece unclear makes the jump worse
7. **Lint holds the first rule, review the rest**
   1. `fe/no-component-file-helpers` fails a component, hook or function beside the component in an app component file
   2. Review holds the cut-offs, the reader's interest and the shape logic takes

**Result**:

1. A reader meets either no jump, where the code sits in the body that uses it, or a named one, where the folder's name says what the piece does and the reader decides whether to open it; never an unannounced jump inside the file
2. Costs:
   1. More files than the folds made
   2. A parent that inlines a child grows by the child's lines
   3. Whether readers usually need a child is a judgement review holds, and two engineers can still weigh it differently near the cut-offs; so is whether a component could hold some logic without a workaround
   4. A helper component that renders its value needs `children` or a `styles` prop before each consumer can place it

## Rejected

1. **Folding only hooks and functions, with components in folders of their own**. Reason: a folded function is the same unannounced jump as a folded component, and a folded hook's state reads as the component's own
2. **A same-file exception for a small presentational child used several times in a parent with little logic**, as the author's canonical conventions allow under five conditions. Reason: each condition is a judgement two engineers can read two ways, and the child is still a jump below the styles
3. **A single cut-off at about 15 or about 25 lines**. Reason: one number ignores whether the reader wants the child; a cut-off low enough for children readers skip sends the ones every reader opens to folders, and one high enough for those inlines children readers skip
4. **A folder of its own for every child**. Reason: a few lines the reader needs anyway become a jump for no gain
5. **Keeping only query, store and form hooks, beside generic functions**. Reason: a hook wrapping a platform API, such as Home's Back twice to close, renders nothing, so it has no component Type to take, and would inline into its screen's body, where every reader of the screen meets wiring they rarely need
6. **Keeping a hook whenever two or more components use it**. Reason: the consumer count says nothing about what the hook does; a query hook with one consumer would inline, and logic computing what one component renders would stay a hook once a second component called it. The test used instead, whether a component could hold the logic without a workaround, turns on what the logic does
7. **Never keeping a hook that wraps more than one outside resource**. Reason: the hook that sends an approval wraps a query, a mutation and the screen's focus, and its name already says what it does; held strictly, the rule would push its sequence back into the button's body or split it across children, to remove a jump its name already makes cheap
