import { bindBankPorts } from "@/mocks/bank/ports";
import { resetDemoBank } from "@/mocks/demo-bank";

import { createJestBankPorts } from "./jest-bank-ports";

beforeEach(() => {
  // Bound fresh per test: shared randomness makes ids and challenges depend on test order.
  bindBankPorts(createJestBankPorts());
  return resetDemoBank();
});
