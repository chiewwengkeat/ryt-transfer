import { bindBankPorts } from "@/mocks/bank/ports";
import { resetDemoBank } from "@/mocks/demo-bank";

import { jestBankPorts } from "./jest-bank-ports";

bindBankPorts(jestBankPorts);

beforeEach(() => resetDemoBank());
