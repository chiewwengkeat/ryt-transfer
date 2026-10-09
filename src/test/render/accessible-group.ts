import type { screen } from "@testing-library/react-native";

// ⛔ Assert on the group, never the text: each text carries the language itself, so it passes either way.
export function findAccessibleGroupAround(
  text: ReturnType<typeof screen.getByText>,
) {
  let element = text.parent;
  while (element !== null && element.props.accessible !== true)
    element = element.parent;
  return element;
}
