import type { DemoLayer } from "@/shared/http/transport";

import { handlersForActiveScenario } from "./demo-bank";
import { createDemoSend } from "./transport/demo-send";

export default {
  demoSend: createDemoSend(handlersForActiveScenario),
} satisfies DemoLayer;
