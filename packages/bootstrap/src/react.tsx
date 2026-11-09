import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { BootstrapPublicState } from "./BootstrapPublicState";

type BootstrapContextValue = BootstrapPublicState & {
  setInitialized(initialized: boolean): void;
};

const BootstrapContext = createContext<BootstrapContextValue | null>(null);

/** Share the HTML bootstrap snapshot; subsequent updates belong to this provider. */
export function BootstrapProvider({
  initialState,
  children,
}: {
  initialState: BootstrapPublicState;
  children: ReactNode;
}) {
  if (
    typeof initialState !== "object" ||
    initialState === null ||
    Array.isArray(initialState) ||
    typeof initialState.initialized !== "boolean"
  ) {
    throw new Error(
      "BootstrapProvider requires initialState with a boolean initialized field.",
    );
  }
  const [initialized, setInitialized] = useState(
    () => initialState.initialized,
  );
  const value = useMemo(() => ({ initialized, setInitialized }), [initialized]);
  return (
    <BootstrapContext.Provider value={value}>
      {children}
    </BootstrapContext.Provider>
  );
}

export function useBootstrap(): BootstrapContextValue {
  const value = useContext(BootstrapContext);
  if (!value)
    throw new Error("useBootstrap must be used within BootstrapProvider.");
  return value;
}
