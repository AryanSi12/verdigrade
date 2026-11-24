import { createContext, useContext } from "react";

export const MigrationContext = createContext(null);

export function useMigration() {
  const value = useContext(MigrationContext);
  if (!value) {
    throw new Error("useMigration must be used inside the app shell.");
  }
  return value;
}
