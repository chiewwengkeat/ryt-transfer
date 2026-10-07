import { configureTransport, type DemoLayer } from "@/shared/http/transport";

// Compared literally, never through the config predicate: Metro strips the demo layer from production only for this form.
if (
  process.env.EXPO_PUBLIC_APP_VARIANT === "demo" ||
  process.env.EXPO_PUBLIC_APP_VARIANT === "development"
) {
  const demoLayer = (require("@/mocks/demo-layer") as { default: DemoLayer })
    .default;
  // At module scope, never in an effect: a screen's effects run before the shell's, so its first request would miss it.
  configureTransport({ send: demoLayer.demoSend });
}
