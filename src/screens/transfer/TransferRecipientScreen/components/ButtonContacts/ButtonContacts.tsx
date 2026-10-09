import {
  Contact,
  getPermissionsAsync,
  requestPermissionsAsync,
} from "expo-contacts";
import {
  type ComponentProps,
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { AppState, Linking } from "react-native";

import { parseRecipientId } from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import { useTrackScenarioShown } from "@/domains/transfer/hooks/use-track-scenario-shown/use-track-scenario-shown";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";

import BannerRecipientUnexpected from "../BannerRecipientUnexpected/BannerRecipientUnexpected";
import BottomSheetContactMobiles from "./components/BottomSheetContactMobiles/BottomSheetContactMobiles";

interface Props {
  onMobilePicked: (mobileId: string) => void;
}
export default function ButtonContacts({ onMobilePicked }: Props) {
  const { t } = useTranslation("transfer");
  const [contactsOutcome, setContactsOutcome] = useState<ContactsOutcome>();
  const [contactMobiles, setContactMobiles] =
    useState<
      ComponentProps<typeof BottomSheetContactMobiles>["contactMobiles"]
    >();
  useTrackScenarioShown(
    contactsOutcome === ContactsOutcome.WithoutMobile
      ? TransferScenarioId.ContactWithoutMobile
      : undefined,
  );

  async function pickMobileFromContacts() {
    setContactsOutcome(undefined);
    try {
      if (!(await requestPermissionsAsync()).granted) {
        setContactsOutcome(ContactsOutcome.AccessRefused);
        return;
      }
      const contact = await Contact.presentPicker();
      if (contact === null) return;
      // Android without the contacts permission, or an iPhone pick outside the contacts it shared.
      const phones = await contact.getPhones().catch(() => null);
      if (phones === null) {
        setContactsOutcome(ContactsOutcome.AccessRefused);
        return;
      }
      const pickedMobiles = phones.flatMap((phone) => {
        // A stored number may carry brackets or dots, which the bank's rule does not strip.
        const mobileId = parseRecipientId(
          RecipientIdType.Mobile,
          (phone.number ?? "").replace(/(?!^\+)\D/g, ""),
        );
        return mobileId === null ? [] : [{ ...phone, mobileId }];
      });
      const distinctMobiles = pickedMobiles.filter(
        (mobile, position) =>
          pickedMobiles.findIndex(
            (earlier) => earlier.mobileId === mobile.mobileId,
          ) === position,
      );
      if (distinctMobiles.length === 0)
        setContactsOutcome(ContactsOutcome.WithoutMobile);
      else if (distinctMobiles.length === 1)
        onMobilePicked(distinctMobiles[0]!.mobileId);
      else setContactMobiles(distinctMobiles);
    } catch {
      setContactsOutcome(ContactsOutcome.Unexpected);
    }
  }

  return (
    <>
      <ButtonSecondary
        label={t("recipient.contacts")}
        onPress={() => {
          void pickMobileFromContacts();
        }}
      />
      {contactsOutcome === ContactsOutcome.AccessRefused && (
        <BannerContactsRefused
          onAccessGranted={() => {
            setContactsOutcome(undefined);
          }}
        />
      )}
      {contactsOutcome === ContactsOutcome.WithoutMobile && (
        <BannerNotice message={t("common.contact_without_mobile.body")} />
      )}
      {contactsOutcome === ContactsOutcome.Unexpected && (
        <BannerRecipientUnexpected
          onRetry={() => {
            void pickMobileFromContacts();
          }}
        />
      )}
      {contactMobiles !== undefined && (
        <BottomSheetContactMobiles
          contactMobiles={contactMobiles}
          onMobileChosen={(mobileId) => {
            setContactMobiles(undefined);
            onMobilePicked(mobileId);
          }}
          onClose={() => {
            setContactMobiles(undefined);
          }}
        />
      )}
    </>
  );
}

interface BannerContactsRefusedProps {
  onAccessGranted: () => void;
}
function BannerContactsRefused({
  onAccessGranted,
}: BannerContactsRefusedProps) {
  const { t } = useTranslation("transfer");
  useTrackScenarioShown(TransferScenarioId.ContactsAccessRefused);
  const recheckContactsAccess = useEffectEvent(async () => {
    if ((await getPermissionsAsync()).granted) onAccessGranted();
  });
  // Access is granted in the phone's Settings, outside the app, so the only sign of it is the app coming back.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (appState) => {
      if (appState === "active") void recheckContactsAccess();
    });
    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <BannerAction
      message={t("common.contacts_access_refused.body")}
      action={{
        label: t("common.contacts_access_refused.open_settings"),
        onPress: () => {
          void Linking.openSettings();
        },
      }}
    />
  );
}

enum ContactsOutcome {
  AccessRefused = "access_refused",
  WithoutMobile = "without_mobile",
  Unexpected = "unexpected",
}
