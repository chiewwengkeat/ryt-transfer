import { fireEvent, screen } from "@testing-library/react-native";
import { getFixedT } from "i18next";

import { approvalSettingsStore } from "@/domains/approval/lib/approval-host-inputs/approval-host-inputs";
import { AppLanguage, pickAppLanguage } from "@/shared/i18n/i18n";
import { findAccessibleGroupAround } from "@/test/accessible-group";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { renderRoute } from "@/test/render-route";

it("tells a screen reader that a transfer's fields and review rows are in Bahasa Malaysia once it is picked", async () => {
  await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "EN, change language" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Bahasa Malaysia" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Pindahan", disabled: false }),
  );
  const mobileField = await screen.findByLabelText(
    "Nombor telefon bimbit DuitNow",
  );
  expect(mobileField).toHaveProp("accessibilityLanguage", "ms-MY");
  await fireEvent.changeText(mobileField, "012-345 6789");
  await fireEvent.press(screen.getByRole("button", { name: "Teruskan" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Jumlah (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Semak" }));
  await screen.findByRole("button", { name: "Pindahkan" });

  expect(findAccessibleGroupAround(screen.getByText("Jumlah"))).toHaveProp(
    "accessibilityLanguage",
    "ms-MY",
  );
});

it("tells a screen reader that the PIN keypad is in Bahasa Malaysia when the app opens with it picked", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  pickAppLanguage(AppLanguage.Malay);
  await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("Nombor telefon bimbit DuitNow"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Teruskan" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Jumlah (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Semak" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Pindahkan" }),
  );
  const malayApprovalT = getFixedT(AppLanguage.Malay, "approval");

  expect(await screen.findByRole("button", { name: "1" })).toHaveProp(
    "accessibilityLanguage",
    "ms-MY",
  );
  expect(
    screen.getByRole("button", { name: malayApprovalT("keypad_pin.delete") }),
  ).toHaveProp("accessibilityLanguage", "ms-MY");
  expect(
    screen.getByLabelText(
      malayApprovalT("keypad_pin.digits_entered", { entered: 0, length: 6 }),
    ),
  ).toHaveProp("accessibilityLanguage", "ms-MY");
});
