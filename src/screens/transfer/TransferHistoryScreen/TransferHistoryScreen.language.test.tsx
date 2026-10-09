import { screen } from "@testing-library/react-native";
import { getFixedT } from "i18next";

import { AppLanguage, pickAppLanguage } from "@/shared/i18n/i18n";
import { findAccessibleGroupAround } from "@/test/render/drive-app";
import { renderRoute } from "@/test/render/render-route";
import {
  buildHistoryTransfer,
  holdTransferHistoryPages,
  serveTransferHistoryPages,
} from "@/test/fixtures/transfer-responses";

it("tells a screen reader that History's days, transfers and loading footer are in Bahasa Malaysia when the app opens with it picked", async () => {
  serveTransferHistoryPages([
    [buildHistoryTransfer()],
    [
      buildHistoryTransfer({
        registeredName: "Lim Wei Jie",
        createdAt: "2026-10-04T13:05:00+08:00",
      }),
    ],
  ]);
  const releaseLaterPages = holdTransferHistoryPages("later");
  pickAppLanguage(AppLanguage.Malay);
  await renderRoute("/transfer-history");

  expect(
    findAccessibleGroupAround(await screen.findByText("Aisyah Rahman")),
  ).toHaveProp("accessibilityLanguage", "ms-MY");
  expect(screen.getByRole("button", { expanded: true })).toHaveProp(
    "accessibilityLanguage",
    "ms-MY",
  );
  expect(
    await screen.findByLabelText(
      getFixedT(
        AppLanguage.Malay,
        "transfer",
      )("view_transfer_history_footer.loading"),
    ),
  ).toHaveProp("accessibilityLanguage", "ms-MY");
  releaseLaterPages();
  expect(
    findAccessibleGroupAround(await screen.findByText("Lim Wei Jie")),
  ).toHaveProp("accessibilityLanguage", "ms-MY");
});
