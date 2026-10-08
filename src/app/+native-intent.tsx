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
  // Only the router's own paths start with a slash: the operating system hands over whole URLs.
  if (path.startsWith("/")) return path;
  const [, scheme = "", linkedPath = ""] =
    /^([a-z][a-z\d+.-]*):\/*(.*)$/i.exec(path) ?? [];
  // iOS also registers the bundle id as a scheme, and no link of ours uses it.
  if (!collectManifestSchemes().includes(scheme.toLowerCase())) return null;
  // A link never replaces a transfer in progress.
  if (isTransferDraftOpen(transferFlowStore.getState())) return null;
  const pathname = `/${linkedPath.split(/[?#]/)[0]?.replace(/\/+$/, "") ?? ""}`;
  return LINKABLE_PATHS.some((linkable) => linkable.test(pathname))
    ? pathname
    : "/";
}
