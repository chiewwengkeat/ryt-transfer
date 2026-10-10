import { createContext } from "react";

// The mock bank's PIN for the PIN sheet to show. Only the root fills it, from the demo layer, so production has none.
export const ApprovalDemoPinContext = createContext<string | undefined>(
  undefined,
);
