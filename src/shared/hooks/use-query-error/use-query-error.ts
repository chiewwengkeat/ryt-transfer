import { useState } from "react";

// React Query clears a no-data query's error while it reads again.
export function useQueryError(error: Error | null, isHolding: boolean) {
  const [kept, setKept] = useState(error);
  const shown = error ?? (isHolding ? kept : null);
  if (shown !== kept) setKept(shown);
  return shown;
}
