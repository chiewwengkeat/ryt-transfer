import type { ObservedRecord } from "@/shared/observability/observability";

export const observedRecords: ObservedRecord[] = [];

export function recordObservation(record: ObservedRecord) {
  observedRecords.push(record);
}

export function reportedScenarios() {
  return observedRecords.flatMap(({ properties }) => properties.scenario ?? []);
}
