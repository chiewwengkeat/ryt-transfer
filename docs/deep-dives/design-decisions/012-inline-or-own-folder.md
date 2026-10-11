# 012. Inline or a folder of its own

## Context

[Decision 011](011-low-mental-load.md) let a small piece with one user fold into that user's file. For a component file, that put a helper component, hook or function below the component's styles, while the file stayed within 200 lines. When the lint rule against them landed, thirteen pieces still sat folded in app component files: ten components, two hooks and a function.

A fold was meant to remove a jump. It moved the jump instead. A reader of the parent who meets `<IconChevron />`, or a call to a folded hook, still has to leave the code they are reading, find the piece below the parent's styles, and come back. The jump is still there; it is only harder to see. The file's name does not announce the piece, and the file reads longer than the component it is named for.

## Decision

- **Nothing folds into a component file.** No component, hook or function sits at module level in a component file beside the component. Constants, types, styles and contexts may stay. A piece one component uses either inlines into that component's body or takes a folder of its own. Module-into-module folds stand as 011 sets them, and a plain module keeps its private functions at its bottom.
- **Inline or a folder: size, then the reader's interest.** A child readers rarely need inlines up to about 15 lines of its own function. One they usually need inlines up to about 40, while the user stays within 200 lines. Anything larger takes a folder of its own. Size counts neither props nor styles, and an inlined child's styles join its user's sheet.
- **A child with state or effects that renders conditionally or in a list never inlines.** Its state resets when it unmounts, or belongs to one row of many; moved into its user, it would outlive the child or be shared by every row. State here is `useState`, `useReducer` or a ref the child owns, or an effect. A store or query read is not state, since it does not reset on unmount.
- **A helper component in its own folder beats an imported hook or function.** A component that shows the value keeps the logic beside what it draws; a hook hands back a value its user must still place.
- **Lint holds the first rule, review the rest.** `fe/no-component-file-helpers` fails a component, hook or function beside the component in an app component file. Review holds the cut-offs and the reader's interest.

So a reader meets either no jump, where the code sits in the body that uses it, or a named one, where the folder's name says what the piece does and the reader can decide whether to open it. Never a jump inside the file that nothing announces.

The costs: more files than the folds made. A parent that inlines a child grows by the child's lines. Whether readers usually need a child is a judgement, which review holds and two engineers can still weigh differently near the cut-offs.

## Rejected

- **Folding only hooks and functions, with components in folders of their own.** A folded function is the same unannounced jump as a folded component, and a folded hook's state reads as the component's own. Chosen instead: nothing folds into a component file.
- **A same-file exception for a small presentational child used several times in a parent with little logic,** as the author's canonical conventions allow under five conditions. Each condition is a judgement two engineers can read two ways, and the child is still a jump below the styles. Chosen instead: no exception.
- **A single cut-off at about 15 or about 25 lines.** One number ignores whether the reader wants the child: a cut-off low enough for children readers skip sends the ones every reader opens to folders, and one high enough for those inlines children readers skip. Chosen instead: about 15 for a child readers rarely need, about 40 for one they usually need.
- **A folder of its own for every child.** A few lines the reader needs anyway become a jump for no gain. Chosen instead: small children inline.
