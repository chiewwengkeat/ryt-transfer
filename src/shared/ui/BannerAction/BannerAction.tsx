import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import type { ComponentProps } from "react";

interface Props extends ComponentProps<typeof BannerNotice> {
  action?: ComponentProps<typeof ButtonSecondary>;
}
export default function BannerAction({ action, ...banner }: Props) {
  return (
    <>
      <BannerNotice {...banner} />
      {action && <ButtonSecondary {...action} />}
    </>
  );
}
