import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

interface Props {
  disabledReason: string | undefined;
  firstReadRunning: boolean;
}
export default function ButtonStartTransfer({
  disabledReason,
  firstReadRunning,
}: Props) {
  const { t } = useTranslation("home");
  return (
    <ButtonPrimary
      label={t("button_start_transfer.label")}
      // A spinner, not the reason: a line that vanishes once the first read lands moves the button.
      loading={firstReadRunning}
      disabledReason={firstReadRunning ? undefined : disabledReason}
      onPress={() => {
        router.push("/transfer");
      }}
    />
  );
}
