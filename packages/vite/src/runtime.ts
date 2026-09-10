import {
  InMemoryCacheService,
  InMemoryContext,
  InMemoryPropertiesService,
  InMemorySession,
  SecurityPolicy,
} from "@gasboost/fake-core";
import { NodeUtilities } from "@gasboost/fake-node";
import type { GasRuntime } from "./gasboost";

const context = new InMemoryContext(
  "",
  "",
  {
    type: "WEB_APP",
    executeAs: "USER",
  },
  new SecurityPolicy([]),
  "en",
  "UTC",
);

export const defaultGasRuntime: GasRuntime = {
  CacheService: new InMemoryCacheService(),
  PropertiesService: new InMemoryPropertiesService(),
  Session: new InMemorySession(context),
  Utilities: new NodeUtilities(),
};

export function installGasRuntime(runtime: GasRuntime = {}): void {
  Object.assign(globalThis, {
    ...defaultGasRuntime,
    ...runtime,
  });
}
