import { createContext } from "react";

// Only the root fills it, from the demo layer, so production has none.
export const ApprovalDemoPinContext = createContext<string | undefined>(
  undefined,
);
