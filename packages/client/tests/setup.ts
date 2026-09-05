import { vi } from "vitest";

(globalThis as any).google = {
  script: {
    run: {},
    history: {
      push: vi.fn(),
      replace: vi.fn(),
      setChangeHandler: vi.fn(),
    },
    url: {
      getLocation: vi.fn(),
    },
  },
};
