import { useState } from "react";

export function useInitialValue<T>(read: () => T) {
  const [value] = useState(read);
  return value;
}
