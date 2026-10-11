import {
  isTransferDraftOpen,
  transferFlowStore,
} from "@/screens/transfer/flow-store/flow-store";
import { collectManifestSchemes } from "expo-linking";

export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}) {
  // Handed nothing at cold start, the router opens the root stack's first screen: the transfer flow, alone.
  const dropped = initial ? "/" : null;
  const [, scheme = "", linkedPath = path] =
    /^([a-z][a-z\d+.-]*):(.*)$/i.exec(path) ?? [];
  // Android hands any app's intent data over as given, so a slash-led path is a link too: it skips only this check.
  // iOS also registers the bundle id as a scheme, and no link of ours uses it.
  if (
    !path.startsWith("/") &&
    !collectManifestSchemes().includes(scheme.toLowerCase())
  )
    return dropped;
  // A link never replaces a transfer in progress.
  if (isTransferDraftOpen(transferFlowStore.getState())) return dropped;
  const pathname = `/${linkedPath.split(/[?#]/)[0]?.replace(/^\/+|\/+$/g, "") ?? ""}`;
  return LINKABLE_PATHS.some((linkable) => linkable.test(pathname))
    ? pathname
    : "/";
}

const LINKABLE_PATHS = [
  /^\/$/,
  /^\/transfer$/,
  /^\/transfer-history$/,
  /^\/transfer-history\/[\w-]+$/,
];
