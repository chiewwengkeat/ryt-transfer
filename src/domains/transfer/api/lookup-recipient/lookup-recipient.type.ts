export enum RecipientIdType {
  Mobile = "MOBILE",
  Nric = "NRIC",
  Passport = "PASSPORT",
  Brn = "BRN",
  ArmyPolice = "ARMY_POLICE",
  AccountNumber = "ACCOUNT_NUMBER",
}

export type LookupRecipientRequest =
  | { idType: RecipientIdType; idValue: string; bankCode?: string }
  | { recentId: string };

export interface LookupRecipientResponse {
  recipient: {
    registeredName: string;
    idType: RecipientIdType;
    idValueMasked: string;
    bankName: string;
    bankCode: string;
  };
  recipientRef: string;
  refExpiresInSeconds: number;
  firstTransfer: boolean;
}

export enum LookupRecipientErrorCode {
  RecipientNotFound = "RECIPIENT_NOT_FOUND",
  InvalidIdFormat = "INVALID_ID_FORMAT",
  TooManyLookups = "TOO_MANY_LOOKUPS",
  NameEnquiryUnavailable = "NAME_ENQUIRY_UNAVAILABLE",
  InvalidRequest = "INVALID_REQUEST",
}

export interface LookupRecipientErrorResponse {
  error: { code: LookupRecipientErrorCode; message: string };
}
