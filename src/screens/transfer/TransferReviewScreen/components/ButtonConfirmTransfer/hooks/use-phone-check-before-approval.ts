import { type NativeStackNavigationProp, useNavigation } from "expo-router";
import { useEffect, useRef, useState } from "react";

import { isApprovalRefusedOnThisPhone } from "@/domains/approval/hooks/device-integrity-verdict";
import {
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowScenario,
} from "@/screens/transfer/state/transfer-flow";

export function usePhoneCheckBeforeApproval() {
  const [checkingPhone, setCheckingPhone] = useState(false);
  const navigation =
    useNavigation<NativeStackNavigationProp<Record<string, undefined>>>();
  const reviewLeaveCountRef = useRef(0);
  useEffect(() => {
    const countLeave = () => {
      reviewLeaveCountRef.current += 1;
    };
    // iOS's own Back and swipe pop review only once their animation ends; this hears them begin.
    const stopHearingClose = navigation.addListener(
      "transitionStart",
      (event) => {
        if (event.data.closing) countLeave();
      },
    );
    return () => {
      stopHearingClose();
      countLeave();
    };
  }, [navigation]);

  const checkPhoneAllowsThisApproval = async () => {
    const leaveCountAtPress = reviewLeaveCountRef.current;
    setCheckingPhone(true);
    const phoneRefusesApproval = await isApprovalRefusedOnThisPhone();
    setCheckingPhone(false);
    // Leaving review while the check runs voids the press, even if they come back: nothing is approved behind them.
    if (reviewLeaveCountRef.current !== leaveCountAtPress) return false;
    if (phoneRefusesApproval)
      dispatchTransferFlow({
        type: TransferFlowActionType.CreateNotSent,
        notice: TransferFlowScenario.RootedPhone,
      });
    return !phoneRefusesApproval;
  };

  return { checkingPhone, checkPhoneAllowsThisApproval };
}
