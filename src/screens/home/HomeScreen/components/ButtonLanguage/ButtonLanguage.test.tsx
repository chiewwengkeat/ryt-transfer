import { fireEvent, screen } from "@testing-library/react-native";
import * as Localization from "expo-localization";

import { relaunchApp, renderRoute } from "@/test/render-route";

function setPhoneLanguage(languageCode: string) {
  jest
    .spyOn(Localization, "getLocales")
    .mockReturnValue([{ languageCode } as Localization.Locale]);
}

afterEach(() => {
  jest.restoreAllMocks();
});

// ⛔ Read the first frame after a relaunch with getBy: a findBy waits, so a language applied late passes too.
it("shows Home in Bahasa Malaysia once it is picked, and still after a relaunch", async () => {
  setPhoneLanguage("en");
  const view = await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "EN, change language" }),
  );
  expect(screen.getByRole("radio", { name: "Phone's language" })).toBeChecked();
  await fireEvent.press(screen.getByRole("radio", { name: "Bahasa Malaysia" }));

  expect(
    await screen.findByRole("button", { name: "Pindahan" }),
  ).toBeOnTheScreen();
  await relaunchApp(view);
  await fireEvent.press(
    screen.getByRole("button", { name: "BM, tukar bahasa" }),
  );
  expect(screen.getByRole("radio", { name: "Bahasa Malaysia" })).toBeChecked();
  expect(
    screen.getByRole("radio", { name: "Bahasa telefon" }),
  ).not.toBeChecked();
});

it("follows the phone's language once Phone's language is picked, and still after a relaunch", async () => {
  setPhoneLanguage("zh");
  const view = await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "EN, change language" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Bahasa Malaysia" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "BM, tukar bahasa" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Bahasa telefon" }));

  expect(await screen.findByRole("button", { name: "转账" })).toBeOnTheScreen();
  await relaunchApp(view);
  expect(screen.getByRole("button", { name: "转账" })).toBeOnTheScreen();
});

it("forgets the pick when Phone's language is picked while the phone shows the same language", async () => {
  setPhoneLanguage("ms");
  const view = await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "EN, change language" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Bahasa Malaysia" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "BM, tukar bahasa" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Bahasa telefon" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "BM, tukar bahasa" }),
  );
  expect(screen.getByRole("radio", { name: "Bahasa telefon" })).toBeChecked();
  await fireEvent.press(
    screen.getByRole("button", { name: "Tutup menu bahasa" }),
  );

  setPhoneLanguage("zh");
  await relaunchApp(view);

  expect(screen.getByRole("button", { name: "转账" })).toBeOnTheScreen();
});

it("reads each language's row in that language, and the control and Phone's language in the app's", async () => {
  await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "EN, change language" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "中文" }));
  const control = await screen.findByRole("button", {
    name: "中文, 更改语言",
  });
  expect(control).toHaveProp("accessibilityLanguage", "zh-MY");
  await fireEvent.press(control);

  expect(screen.getByRole("radio", { name: "手机语言" })).toHaveProp(
    "accessibilityLanguage",
    "zh-MY",
  );
  expect(screen.getByRole("radio", { name: "English" })).toHaveProp(
    "accessibilityLanguage",
    "en-MY",
  );
  expect(screen.getByRole("radio", { name: "Bahasa Malaysia" })).toHaveProp(
    "accessibilityLanguage",
    "ms-MY",
  );
  expect(screen.getByRole("radio", { name: "中文" })).toHaveProp(
    "accessibilityLanguage",
    "zh-MY",
  );
});
