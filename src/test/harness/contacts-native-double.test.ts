import { PermissionStatus } from "expo";
import {
  Contact,
  getPermissionsAsync,
  requestPermissionsAsync,
} from "expo-contacts";

import {
  resetContactsNativeDouble,
  setContactsPermission,
  setPickedContactPhones,
  setPickedContactUnreadable,
} from "./contacts-native-double";

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

it("picks a contact whose phones it then refuses to read", async () => {
  setPickedContactUnreadable();

  const contact = await Contact.presentPicker();

  await expect(contact?.getPhones()).rejects.toThrow();
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
