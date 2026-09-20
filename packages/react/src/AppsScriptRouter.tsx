import { AppsScriptHistoryPipeline } from "@gasboost/client";
import type { PropsWithChildren } from "react";
import { useEffect, useState } from "react";

type AppsScriptHistoryRuntime = {
  google?: {
    script?: {
      history?: {
        setChangeHandler?: unknown;
      };
      url?: {
        getLocation?: unknown;
      };
    };
  };
};

function hasAppsScriptHistoryRuntime() {
  const { google } = globalThis as AppsScriptHistoryRuntime;

  return (
    typeof google === "object" &&
    google !== null &&
    typeof google.script?.url?.getLocation === "function" &&
    typeof google.script?.history?.setChangeHandler === "function"
  );
}

export function AppsScriptRouter({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hasAppsScriptHistoryRuntime()) {
      setReady(true);
      return;
    }

    let dispose: (() => void) | undefined;

    AppsScriptHistoryPipeline.create((pipeline) => {
      dispose = pipeline.sync();
      setReady(true);
    });

    return () => {
      dispose?.();
    };
  }, []);

  if (!ready) {
    return null;
  }

  return children;
}
