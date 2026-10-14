export interface AuthStorage {
  get(): string | null;
  set(token: string): void;
  remove(): void;
}

export function createMemoryAuthStorage(): AuthStorage {
  let token: string | null = null;
  return {
    get: () => token,
    set: (value) => {
      token = value;
    },
    remove: () => {
      token = null;
    },
  };
}

export const memoryAuthStorage = createMemoryAuthStorage();
export const AUTH_STORAGE_KEY = "gasboost.sessionToken";

// Access browser globals lazily, so importing the package is safe during SSR.
function browserStorage(name: "localStorage" | "sessionStorage"): AuthStorage {
  return {
    get: () =>
      typeof window === "undefined"
        ? null
        : window[name].getItem(AUTH_STORAGE_KEY),
    set: (token) => {
      if (typeof window !== "undefined")
        window[name].setItem(AUTH_STORAGE_KEY, token);
    },
    remove: () => {
      if (typeof window !== "undefined")
        window[name].removeItem(AUTH_STORAGE_KEY);
    },
  };
}

export const localStorageAuthStorage = browserStorage("localStorage");
export const sessionStorageAuthStorage = browserStorage("sessionStorage");
