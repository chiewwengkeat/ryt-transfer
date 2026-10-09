import {
  fireEvent,
  screen,
  waitForElementToBeRemoved,
} from "@testing-library/react-native";
import { PermissionStatus } from "expo";
import { Linking } from "react-native";

import { moveAppTo, scenarioTest } from "@/test/render/drive-app";
import {
  setContactsPermission,
  setContactsPickerFailingOnce,
  setPickedContactPhones,
  setPickedContactUnreadable,
} from "@/test/doubles/contacts-native-double";
import { reportedScenarios } from "@/test/doubles/native-doubles";
import { renderRoute } from "@/test/render/render-route";

afterEach(() => {
  jest.restoreAllMocks();
});

it(
  "says how to allow contacts access when it is refused, and drops that once Settings grants it",
  scenarioTest("transfer.contacts_access_refused", async () => {
    setContactsPermission(REFUSED);
    const openSettings = jest
      .spyOn(Linking, "openSettings")
      .mockResolvedValue(undefined);
    await pressChooseFromContacts();

    expect(await screen.findByText(REFUSED_MESSAGE)).toBeOnTheScreen();
    expect(reportedScenarios()).toContain("transfer.contacts_access_refused");
    await fireEvent.press(
      screen.getByRole("button", { name: "Open Settings" }),
    );
    expect(openSettings).toHaveBeenCalledTimes(1);

    setContactsPermission(GRANTED);
    moveAppTo("active");

    await waitForElementToBeRemoved(() => screen.queryByText(REFUSED_MESSAGE));
  }),
);

it(
  "takes a typed number in place of a contact when contacts access is refused",
  scenarioTest("transfer.contacts_access_refused", async () => {
    setContactsPermission(REFUSED);
    await pressChooseFromContacts();
    await screen.findByText(REFUSED_MESSAGE);

    await fireEvent.changeText(
      screen.getByLabelText("DuitNow mobile number"),
      "012-345 6789",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByLabelText("Amount (RM)")).toBeOnTheScreen();
  }),
);

it("opens the picker under limited access, and treats a pick it may not read as refused access", async () => {
  setContactsPermission({ ...GRANTED, accessPrivileges: "limited" });
  setPickedContactUnreadable();
  await pressChooseFromContacts();

  expect(await screen.findByText(REFUSED_MESSAGE)).toBeOnTheScreen();
});

it(
  "says when the picked contact has no Malaysian mobile number, fills in nothing, and takes the next contact's",
  scenarioTest("transfer.contact_without_mobile", async () => {
    const noMobileMessage =
      "That contact has no Malaysian mobile number. Pick another contact, or type a number.";
    setPickedContactPhones([
      { id: "phone-1", label: "work", number: "+60 3-2345 6789" },
      { id: "phone-2", label: "mobile", number: "+65 9123 4567" },
    ]);
    await pressChooseFromContacts();

    expect(await screen.findByText(noMobileMessage)).toBeOnTheScreen();
    expect(screen.getByLabelText("DuitNow mobile number")).toHaveDisplayValue(
      "",
    );
    expect(reportedScenarios()).toContain("transfer.contact_without_mobile");

    setPickedContactPhones([
      { id: "phone-1", label: "mobile", number: "012-345 6789" },
    ]);
    await fireEvent.press(
      screen.getByRole("button", { name: "Choose from contacts" }),
    );

    expect(await screen.findByDisplayValue("+60123456789")).toBeOnTheScreen();
    expect(screen.queryByText(noMobileMessage)).toBeNull();
  }),
);

it("fills in the picked contact's one Malaysian mobile number", async () => {
  setPickedContactPhones([
    { id: "phone-1", label: "mobile", number: "(012) 345-6789" },
    { id: "phone-2", label: "work", number: "+60 3-2345 6789" },
  ]);
  await pressChooseFromContacts();

  expect(await screen.findByDisplayValue("+60123456789")).toBeOnTheScreen();
});

it("says something unexpected went wrong when the contacts picker fails, and opens it again on Try again", async () => {
  setContactsPickerFailingOnce();
  await pressChooseFromContacts();
  expect(
    await screen.findByText("Something unexpected went wrong."),
  ).toBeOnTheScreen();
  setPickedContactPhones([
    { id: "phone-1", label: "mobile", number: "012-345 6789" },
  ]);

  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByDisplayValue("+60123456789")).toBeOnTheScreen();
});

it("asks which number to use when the contact has several Malaysian mobiles, each once", async () => {
  setPickedContactPhones([
    { id: "phone-1", label: "mobile", number: "012-345 6789" },
    { id: "phone-2", label: "home", number: "+60 19-876 5432" },
    { id: "phone-3", label: "iPhone", number: "0123456789" },
  ]);
  await pressChooseFromContacts();
  await screen.findByRole("header", { name: "Choose a number" });

  expect(
    screen.queryByRole("button", { name: /iPhone/ }),
  ).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: /19-876 5432/ }));
  expect(await screen.findByDisplayValue("+60198765432")).toBeOnTheScreen();
});

const REFUSED_MESSAGE =
  "To choose from your contacts, allow contacts access in Settings. Or type the number.";
const GRANTED = {
  status: PermissionStatus.GRANTED,
  granted: true,
  canAskAgain: true,
  expires: "never" as const,
};
const REFUSED = {
  status: PermissionStatus.DENIED,
  granted: false,
  canAskAgain: false,
  expires: "never" as const,
};

async function pressChooseFromContacts() {
  await renderRoute("/transfer");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Choose from contacts" }),
  );
}
