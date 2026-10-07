import { PermissionStatus } from "expo";
import type * as ExpoContacts from "expo-contacts";

import {
  contactsNativeDouble,
  resetContactsNativeDouble,
  setContactsPermission,
  setPickedContactPhones,
} from "./contacts-native-double";

// Imports hoist, so the library is required only once its double is in place.
globalThis.expo.modules.ExpoContactsNext = contactsNativeDouble;
const { Contact, getPermissionsAsync, requestPermissionsAsync } =
  jest.requireActual<typeof ExpoContacts>("expo-contacts");

const REFUSED_PERMISSION = {
  status: PermissionStatus.DENIED,
  granted: false,
  canAskAgain: false,
  expires: "never" as const,
};
const PICKED_PHONES = [
  { id: "phone-1", label: "mobile", number: "012-345 6789" },
  { id: "phone-2", label: "work", number: "+60 3-2345 6789" },
];

afterEach(() => {
  resetContactsNativeDouble();
});

it("grants contacts access whether the app checks or asks", async () => {
  const granted = { status: PermissionStatus.GRANTED, granted: true };

  await expect(getPermissionsAsync()).resolves.toMatchObject(granted);
  await expect(requestPermissionsAsync()).resolves.toMatchObject(granted);
});

it("returns no contact from the picker", async () => {
  await expect(Contact.presentPicker()).resolves.toBeNull();
});

it("returns the contact a test picks, with that contact's phones", async () => {
  setPickedContactPhones(PICKED_PHONES);

  const contact = await Contact.presentPicker();

  await expect(contact?.getPhones()).resolves.toEqual(PICKED_PHONES);
});

it("answers with the permission a test sets", async () => {
  setContactsPermission(REFUSED_PERMISSION);

  await expect(requestPermissionsAsync()).resolves.toEqual(REFUSED_PERMISSION);
});

it("puts back granted access and an empty pick on reset", async () => {
  setContactsPermission(REFUSED_PERMISSION);
  setPickedContactPhones(PICKED_PHONES);

  resetContactsNativeDouble();

  await expect(getPermissionsAsync()).resolves.toMatchObject({ granted: true });
  await expect(Contact.presentPicker()).resolves.toBeNull();
});
