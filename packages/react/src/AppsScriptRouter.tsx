import type { PropsWithChildren } from "react";
import { useEffect, useState } from "react";

import {
  AppsScriptContainer,
  AppsScriptHistoryPipeline,
  AppsScriptIframe,
} from "@gasboost/client";

export function AppsScriptRouter({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let dispose: (() => void) | undefined;

    AppsScriptContainer.load((container) => {
      if (disposed) {
        return;
      }

      const iframe = new AppsScriptIframe();
      const pipeline = new AppsScriptHistoryPipeline(container, iframe);

      dispose = pipeline.sync();

      setReady(true);
    });

    return () => {
      disposed = true;
      dispose?.();
    };
  }, []);

  if (!ready) {
    return null;
  }

  return children;
}
