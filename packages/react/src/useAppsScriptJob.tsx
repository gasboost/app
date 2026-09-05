import { AppsScriptJobStore } from "@gasboost/client";
import { useSyncExternalStore } from "react";

export function useAppsScriptJob(jobStore: AppsScriptJobStore) {
  return useSyncExternalStore(
    jobStore.subscribe.bind(jobStore),
    jobStore.getSnapshot.bind(jobStore),
  );
}
