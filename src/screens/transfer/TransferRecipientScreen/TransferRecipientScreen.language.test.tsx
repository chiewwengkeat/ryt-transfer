import { fireEvent, screen } from "@testing-library/react-native";
import { getFixedT } from "i18next";

import { AppLanguage, pickAppLanguage } from "@/shared/i18n/i18n";
import { findAccessibleGroupAround } from "@/test/accessible-group";
import { setPickedContactPhones } from "@/test/harness/contacts-native-double";
import { renderRoute } from "@/test/render-route";

const malayTransferT = getFixedT(AppLanguage.Malay, "transfer");

it("tells a screen reader that the recipient step's recent recipients, ID types, bank field and banks are in Bahasa Malaysia when the app opens with it picked", async () => {
  pickAppLanguage(AppLanguage.Malay);
  await renderRoute("/transfer");
  const [firstRecent] = await screen.findAllByRole("button", { name: /••••/ });
  expect(firstRecent).toHaveProp("accessibilityLanguage", "ms-MY");
  const accountNumberChip = screen.getByRole("radio", {
    name: malayTransferT("recipient.id_type.account_number"),
  });
  expect(accountNumberChip).toHaveProp("accessibilityLanguage", "ms-MY");
  await fireEvent.press(accountNumberChip);
  const bankField = screen.getByRole("button", {
    name: malayTransferT("recipient.bank_label"),
  });
  expect(bankField).toHaveProp("accessibilityLanguage", "ms-MY");
  await fireEvent.press(bankField);

  expect(await screen.findByRole("button", { name: "Maybank" })).toHaveProp(
    "accessibilityLanguage",
    "ms-MY",
  );
});

it("tells a screen reader that a contact's numbers are in Bahasa Malaysia when the app opens with it picked", async () => {
  setPickedContactPhones([
    { id: "phone-1", label: "mobile", number: "012-345 6789" },
    { id: "phone-2", label: "home", number: "+60 19-876 5432" },
  ]);
  pickAppLanguage(AppLanguage.Malay);
  await renderRoute("/transfer");
  await fireEvent.press(
    await screen.findByRole("button", {
      name: malayTransferT("recipient.contacts"),
    }),
  );

  expect(
    findAccessibleGroupAround(await screen.findByText("+60 19-876 5432")),
  ).toHaveProp("accessibilityLanguage", "ms-MY");
});
