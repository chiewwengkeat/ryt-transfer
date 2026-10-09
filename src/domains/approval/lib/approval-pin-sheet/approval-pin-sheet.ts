import { createStore } from "zustand/vanilla";

export enum ApprovalPinSheetStep {
  Closed = "closed",
  AwaitingPin = "awaiting_pin",
  Sending = "sending",
  PinLocked = "pin_locked",
}

const CLOSED_SHEET: ApprovalPinSheet = { step: ApprovalPinSheetStep.Closed };

// ⛔ Never the PIN: it passes through `answer` to the caller and lives only in that call.
export const approvalPinSheetStore = createStore<ApprovalPinSheet>()(
  () => CLOSED_SHEET,
);

// null: the person closed the sheet instead; undefined: the session's end closed it.
export function askForApprovalPin(words: ApprovalPinSheetWords) {
  return new Promise<string | null | undefined>((resolve) => {
    approvalPinSheetStore.setState(
      {
        step: ApprovalPinSheetStep.AwaitingPin,
        ...words,
        answer: (pin) => {
          // Sending at once, before the caller resumes: from here the sheet can no longer be closed.
          approvalPinSheetStore.setState(
            typeof pin !== "string"
              ? CLOSED_SHEET
              : {
                  step: ApprovalPinSheetStep.Sending,
                  ...words,
                  answer: IGNORE_ANSWER,
                },
            true,
          );
          resolve(pin);
        },
      },
      true,
    );
  });
}

export function showApprovalPinLocked(message: string) {
  return new Promise<void>((resolve) => {
    approvalPinSheetStore.setState(
      {
        step: ApprovalPinSheetStep.PinLocked,
        message,
        answer: () => {
          approvalPinSheetStore.setState(CLOSED_SHEET, true);
          resolve();
        },
      },
      true,
    );
  });
}

export function closeApprovalPinSheet() {
  approvalPinSheetStore.setState(CLOSED_SHEET, true);
}

const IGNORE_ANSWER = () => undefined;

type ApprovalPinSheetWords = {
  message: string;
  detail?: string;
  refusal?: string;
};

type ApprovalPinSheet =
  | { step: ApprovalPinSheetStep.Closed }
  | ({
      step:
        | ApprovalPinSheetStep.AwaitingPin
        | ApprovalPinSheetStep.Sending
        | ApprovalPinSheetStep.PinLocked;
      answer: (pin: string | null | undefined) => void;
    } & ApprovalPinSheetWords);
