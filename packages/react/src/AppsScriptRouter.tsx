import { AppsScriptHistoryPipeline } from "@gasboost/client";
import type { PropsWithChildren } from "react";
import { useEffect, useState } from "react";

export function AppsScriptRouter({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
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
