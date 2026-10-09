import { QueryClient } from "@tanstack/react-query";

// For a test that builds its own client: each cache entry's 5-minute gc timer runs on real time and holds Jest open.
export function createQueryClientWithoutGcTimers() {
  return new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
}
