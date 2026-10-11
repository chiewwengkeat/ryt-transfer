import { transferKeys } from "@/domains/transfer/api/transfer.keys";
import {
  isSessionEndFailure,
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error/transport-error";
import type { QueryClient } from "@tanstack/react-query";

// A found recipient stays: asking again mints another reference. After sign-in a refusal stays too, as asking again meets
// the check limit; a Demo pick asks it again, since the picked scenario may answer it otherwise.
export function readAgainEveryReadButAnsweredNameChecks(
  queryClient: QueryClient,
  { refusalsAreAnswers }: { refusalsAreAnswers: boolean },
) {
  void queryClient.invalidateQueries({
    predicate: ({ queryKey, state: { status, error } }) =>
      queryKey[0] !== transferKeys.lookupAll[0] ||
      status === "pending" ||
      (status === "error" &&
        (!refusalsAreAnswers ||
          isSessionEndFailure(error) ||
          (error instanceof TransportError &&
            ([
              TransportErrorKind.Network,
              TransportErrorKind.Timeout,
              TransportErrorKind.Aborted,
            ].includes(error.kind) ||
              // A server error the bank put no code on is no answer from it.
              (error.kind === TransportErrorKind.Http &&
                (error.status ?? 0) >= 500 &&
                error.code === undefined))))),
  });
}
