import { createLocalStorageStore, useLocalStorage } from "@/utils/storageStore";

export const SHOW_MAP_STORAGE_KEY = "showMap";

export const showMapStore = createLocalStorageStore<boolean>(
  SHOW_MAP_STORAGE_KEY,
  true,
  (raw) => raw === null || raw === "true",
  String,
);

export function useShowMapPreference() {
  return useLocalStorage(showMapStore);
}
