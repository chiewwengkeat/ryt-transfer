import { PermissionStatus } from "expo";
// ⛔ Type imports only from expo-contacts: a value import loads it before its double is installed.
import type { ContactsPermissionResponse, ExistingPhone } from "expo-contacts";

class ContactDouble {
  readonly phones: ExistingPhone[];

  constructor(phones: ExistingPhone[]) {
    this.phones = phones;
  }

  static presentPicker() {
    if (contactsPickerFailsNext) {
      contactsPickerFailsNext = false;
      return Promise.reject(new Error("The contacts picker could not open."));
    }
    return Promise.resolve(
      pickedContactPhones === null
        ? null
        : new ContactDouble(pickedContactPhones),
    );
  }

  // A prototype method, never an arrow property: jest-expo wraps a class with none in jest.fn,
  // which drops the static picker.
  getPhones() {
    return pickedContactUnreadable
      ? Promise.reject(new Error("The app may not read this contact."))
      : Promise.resolve(this.phones);
  }
}

export const contactsNativeDouble = {
  Contact: ContactDouble,
  getPermissionsAsync: () => Promise.resolve(contactsPermission),
  requestPermissionsAsync: () => Promise.resolve(contactsPermission),
};

export function setContactsPermission(permission: ContactsPermissionResponse) {
  contactsPermission = permission;
}

// null: the customer leaves the picker without choosing anyone.
export function setPickedContactPhones(phones: ExistingPhone[] | null) {
  pickedContactPhones = phones;
}

// As on Android without the contacts permission, or an iPhone pick outside the contacts it shared.
export function setPickedContactUnreadable() {
  pickedContactPhones = [];
  pickedContactUnreadable = true;
}

export function setContactsPickerFailingOnce() {
  contactsPickerFailsNext = true;
}

export function resetContactsNativeDouble() {
  contactsPermission = GRANTED_CONTACTS_PERMISSION;
  pickedContactPhones = null;
  pickedContactUnreadable = false;
  contactsPickerFailsNext = false;
}

const GRANTED_CONTACTS_PERMISSION: ContactsPermissionResponse = {
  status: PermissionStatus.GRANTED,
  granted: true,
  canAskAgain: true,
  expires: "never",
};

let contactsPermission = GRANTED_CONTACTS_PERMISSION;
let pickedContactPhones: ExistingPhone[] | null = null;
let pickedContactUnreadable = false;
let contactsPickerFailsNext = false;
