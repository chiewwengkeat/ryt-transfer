import { type NativeStackNavigationProp, useNavigation } from "expo-router";
import { useEffect, useRef } from "react";

export function useReviewLeaveWatch() {
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

  return () => {
    const leaveCountAtStart = reviewLeaveCountRef.current;
    return () => reviewLeaveCountRef.current !== leaveCountAtStart;
  };
}
