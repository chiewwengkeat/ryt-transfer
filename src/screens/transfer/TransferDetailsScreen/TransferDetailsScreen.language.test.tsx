import { act, screen } from "@testing-library/react-native";

import { AppLanguage, pickAppLanguage } from "@/shared/i18n/i18n";
import { renderRoute } from "@/test/render/render-route";
import {
  serveTransferDetails,
  buildHistoryTransfer,
  serveTransferHistoryPages,
} from "@/test/fixtures/transfer-responses";

it("shows when a transfer was sent in Bahasa Malaysia, and in Chinese once the language is switched", async () => {
  const transfer = buildHistoryTransfer({
    createdAt: "2026-03-05T15:42:00+08:00",
  });
  serveTransferHistoryPages([[transfer]]);
  serveTransferDetails(transfer);
  pickAppLanguage(AppLanguage.Malay);
  await renderRoute(`/transfer-history/${transfer.transferId}`);

  expect(await screen.findByText("5 Mac 2026, 3:42 PTG")).toBeOnTheScreen();
  await act(() => {
    pickAppLanguage(AppLanguage.Chinese);
  });
  expect(await screen.findByText("2026年3月5日 下午3:42")).toBeOnTheScreen();
});
