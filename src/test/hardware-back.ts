import { act } from "@testing-library/react-native";
import { DeviceEventEmitter } from "react-native";

export async function pressHardwareBack() {
  await act(() => {
    DeviceEventEmitter.emit("hardwareBackPress");
  });
}
