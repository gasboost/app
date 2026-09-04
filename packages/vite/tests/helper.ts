import { build } from "vite";

type BuildResult = Awaited<ReturnType<typeof build>>;

export function getBuildOutputs(result: BuildResult) {
  if (!Array.isArray(result)) {
    if (!("output" in result)) {
      throw new Error(
        "Unexpected RolldownWatcher. build.watch must be disabled in tests.",
      );
    }

    return result.output;
  }

  return result.flatMap((item) => item.output);
}
