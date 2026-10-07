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
  const linkedPath = /^(?:ryt|ryt-demo|ryt-dev):\/*(.*)$/.exec(path)?.[1];
  // A path with none of the app's schemes is the router's own, never a link from outside.
  if (linkedPath === undefined) return path;
  // Kept where it is: a link must never swap out a transfer someone is in the middle of.
  if (isTransferDraftOpen(transferFlowStore.getState())) return null;
  const pathname = `/${linkedPath.split(/[?#]/)[0]?.replace(/\/+$/, "") ?? ""}`;
  return LINKABLE_PATHS.some((linkable) => linkable.test(pathname))
    ? pathname
    : "/";
}
