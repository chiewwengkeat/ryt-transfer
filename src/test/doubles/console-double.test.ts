/* eslint-disable no-restricted-globals -- a double of console itself, which logs nothing of its own */
import { hideConsoleError } from "./console-double";

it("hides only the error it is given and msw's pointer to it, and prints every other error", () => {
  const printed: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    printed.push(args);
  };
  const otherError = new Error("bank bug");

  hideConsoleError("render failed");
  console.error("Caught error:", new Error("render failed"), {});
  console.error(new Error("render failed"));
  console.error(`${MSW_POINTER} for "GET /probe".`);
  console.error(otherError);
  console.error(`${MSW_POINTER} for "GET /other".`);
  console.error("An update was not wrapped in act(...).");

  expect(printed).toEqual([
    [otherError],
    [`${MSW_POINTER} for "GET /other".`],
    ["An update was not wrapped in act(...)."],
  ]);
});

const MSW_POINTER =
  "[MSW] Encountered an unhandled exception during the handler lookup";
