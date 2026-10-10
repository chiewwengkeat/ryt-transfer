// The root reports it: the mock bank may not read the transfer flow, and Home reads the same limits.
export function watchAmountStepOpen(reader: () => boolean) {
  readAmountStepOpen = reader;
}

export function isAmountStepOpen() {
  return readAmountStepOpen();
}

// True until the app's root says otherwise: Jest runs as production, where the root wires nothing.
let readAmountStepOpen = () => true;
