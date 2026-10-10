import { useState } from "react";

// A query with no data drops its error the moment it is read again. Through a pressed retry the
// failure stays, so its Try again stays on screen spinning; a read the app starts itself still clears it.
export function useRetryKeepingFailure(
  error: Error | null,
  retryRead: () => Promise<unknown>,
) {
  const [lastError, setLastError] = useState<Error | null>(null);
  const [retryRunning, setRetryRunning] = useState(false);
  if (error !== null && error !== lastError) setLastError(error);
  return {
    failure: error ?? (retryRunning ? lastError : null),
    retry: async () => {
      setRetryRunning(true);
      try {
        await retryRead();
      } finally {
        setRetryRunning(false);
      }
    },
  };
}
