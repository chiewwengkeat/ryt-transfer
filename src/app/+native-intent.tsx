import { collectManifestSchemes } from "expo-linking";

import {
  isTransferDraftOpen,
  transferFlowStore,
} from "@/screens/transfer/state/transfer-flow";

const LINKABLE_PATHS = [
  /^\/$/,
  /^\/transfer$/,
  /^\/transfer-history$/,
  /^\/transfer-history\/[\w-]+$/,
];

export function redirectSystemPath({ path }: { path: string }) {
  const [, scheme = "", linkedPath = path] =
    /^([a-z][a-z\d+.-]*):(.*)$/i.exec(path) ?? [];
  // Android hands any app's intent data over as given, so a slash-led path is a link too: it skips only this check.
  // iOS also registers the bundle id as a scheme, and no link of ours uses it.
  if (
    !path.startsWith("/") &&
    !collectManifestSchemes().includes(scheme.toLowerCase())
  )
    return null;
  // A link never replaces a transfer in progress.
  if (isTransferDraftOpen(transferFlowStore.getState())) return null;
  const pathname = `/${linkedPath.split(/[?#]/)[0]?.replace(/^\/+|\/+$/g, "") ?? ""}`;
  return LINKABLE_PATHS.some((linkable) => linkable.test(pathname))
    ? pathname
    : "/";
}
