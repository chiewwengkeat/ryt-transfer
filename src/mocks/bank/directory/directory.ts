import {
  RecipientIdType,
  type LookupRecipientResponse,
} from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";

export const DUITNOW_BANKS = [
  { bankCode: "MBB", name: "Maybank" },
  { bankCode: "CIMB", name: "CIMB Bank" },
  { bankCode: "PBB", name: "Public Bank" },
  { bankCode: "RHB", name: "RHB Bank" },
  { bankCode: "HLB", name: "Hong Leong Bank" },
  { bankCode: "BIMB", name: "Bank Islam" },
  { bankCode: "BKRM", name: "Bank Rakyat" },
  { bankCode: "BSN", name: "BSN" },
  { bankCode: "OCBC", name: "OCBC Bank" },
  { bankCode: "UOB", name: "UOB Malaysia" },
  { bankCode: "ABMB", name: "Alliance Bank" },
  { bankCode: "AFFIN", name: "Affin Bank" },
  { bankCode: "RYT", name: "Ryt Bank" },
];

// FNV-1a: the same ID must resolve to the same name and bank on every launch and device.
export function stableHash(text: string) {
  let hash = 0x811c9dc5;
  for (const character of text) {
    hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 0x01000193) >>> 0;
  }
  return hash;
}

export function directoryEntryFor(id: {
  idType: RecipientIdType;
  idValue: string;
  bankCode?: string;
}): LookupRecipientResponse["recipient"] {
  const hash = stableHash(`${id.idType}:${id.idValue}`);
  const names =
    id.idType === RecipientIdType.Brn ? BUSINESS_NAMES : PERSON_NAMES;
  // An account number names its bank; every other DuitNow ID is registered to one.
  const bank =
    (id.idType === RecipientIdType.AccountNumber &&
      DUITNOW_BANKS.find((candidate) => candidate.bankCode === id.bankCode)) ||
    DUITNOW_BANKS[hash % DUITNOW_BANKS.length]!;
  return {
    registeredName: names[(hash >>> 8) % names.length]!,
    idType: id.idType,
    idValueMasked: `•••• ${id.idValue.slice(-4)}`,
    bankName: bank.name,
    bankCode: bank.bankCode,
  };
}

const PERSON_NAMES = [
  "NUR AISYAH BINTI AHMAD",
  "MUHAMMAD HAFIZ BIN ISMAIL",
  "TAN WEI MING",
  "LIM MEI LING",
  "SITI AMINAH BINTI RAHMAN",
  "WONG KAH HOE",
  "RAJESH A/L SUBRAMANIAM",
  "PRIYA A/P KRISHNAN",
  "AHMAD FARIS BIN ZAKARIA",
  "CHONG SIEW LAN",
  "NG CHEE KEONG",
  "NURUL HUDA BINTI OMAR",
  "KAVITHA A/P RAMASAMY",
  "LEE JIA HUI",
  "MOHD AZLAN BIN YUSOF",
  "GOH BOON HUAT",
  "FARAH NADIA BINTI HASSAN",
  "ARUN A/L MUTHU",
  "CHEAH SOOK YEE",
  "AMIRUL HAKIM BIN SAZALI",
  "TEO KAI XIANG",
  "DEVI A/P GOVINDASAMY",
];

const BUSINESS_NAMES = [
  "KEDAI RUNCIT SRI MAJU",
  "SYARIKAT ANGKASA JAYA SDN BHD",
  "LIM BROTHERS TRADING",
  "RESTORAN SELERA KAMPUNG",
  "BENGKEL KERETA AHMAD",
  "PUSAT TUISYEN CEMERLANG",
  "DOBI EXPRESS ENTERPRISE",
];
