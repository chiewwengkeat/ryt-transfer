import type { ObservedRecord } from "@/shared/observability/observability";

export const observedRecords: ObservedRecord[] = [];

export function recordObservation(record: ObservedRecord) {
  observedRecords.push(record);
}
