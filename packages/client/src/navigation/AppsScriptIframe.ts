import { HashProperty } from "./HashProperty";
import { NavigationEntry } from "./NavigationEntry";
import { NavigationLocation } from "./NavigationLocation";

export class AppsScriptIframe {
  private entry: NavigationEntry;

  constructor() {
    this.entry = this.read();
  }

  observe(handler: (entry: NavigationEntry) => void) {
    const listener = () => {
      const entry = this.read();

      this.entry = entry;

      handler(entry);
    };

    window.addEventListener("hashchange", listener);
    window.addEventListener("popstate", listener);

    return () => {
      window.removeEventListener("hashchange", listener);
      window.removeEventListener("popstate", listener);
    };
  }

  sync(entry: NavigationEntry) {
    if (this.entry.equals(entry)) {
      return;
    }

    const hash = entry.location.hash.normalize();
    const search = entry.location.searchParams.toString();
    const nextHash = search ? `${hash}?${search}` : hash;

    history.replaceState(entry.state, "", nextHash);

    this.entry = entry;
  }

  current() {
    return this.entry;
  }

  private read() {
    const normalized = new HashProperty(window.location.hash)
      .toString()
      .replace(/^#/, "");

    const [path = "/", query = ""] = normalized.split("?");

    return new NavigationEntry(
      history.state ?? {},
      new NavigationLocation(
        new HashProperty(path),
        new URLSearchParams(query),
      ),
    );
  }
}
