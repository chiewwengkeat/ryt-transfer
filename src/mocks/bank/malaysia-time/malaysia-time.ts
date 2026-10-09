export function toMalaysiaIso(epochMs: number) {
  return new Date(epochMs + MALAYSIA_OFFSET_MS)
    .toISOString()
    .replace("Z", "+08:00");
}

export function malaysianIsoDate(epochMs: number) {
  return toMalaysiaIso(epochMs).slice(0, 10);
}

const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000;
