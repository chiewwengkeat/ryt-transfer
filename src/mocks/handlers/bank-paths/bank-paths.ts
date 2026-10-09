// Path-only, so the bank answers whatever origin the app's API base URL names.
export const BANK_PATHS = {
  primaryAccount: "*/accounts/primary",
  transferLimits: "*/transfer-limits",
  recipientLookup: "*/recipients/lookup",
  recentRecipients: "*/recipients/recent",
  banks: "*/banks",
  transfers: "*/transfers",
  transfer: "*/transfers/:transferId",
  transferApproval: "*/transfers/:transferId/approve",
  approvalKeys: "*/approval-keys",
};
