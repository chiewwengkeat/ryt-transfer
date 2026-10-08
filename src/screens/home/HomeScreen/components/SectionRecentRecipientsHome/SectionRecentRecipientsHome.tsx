import { router } from "expo-router";

import SectionRecentRecipients from "@/domains/transfer/components/SectionRecentRecipients/SectionRecentRecipients";

export default function SectionRecentRecipientsHome() {
  return (
    <SectionRecentRecipients
      onRecentChosen={(recentId) => {
        router.push({ pathname: "/transfer", params: { recentId } });
      }}
    />
  );
}
