import { google } from "../google";

import { NavigationEntry } from "./NavigationEntry";

export class AppsScriptContainer {
  private constructor(private entry: NavigationEntry) {}

  static load(callback: (container: AppsScriptContainer) => void) {
    google.script.url.getLocation((location) => {
      callback(new AppsScriptContainer(NavigationEntry.fromGoogle(location)));
    });
  }

  observe(handler: (entry: NavigationEntry) => void) {
    google.script.history.setChangeHandler((event) => {
      const entry = NavigationEntry.fromGoogle(event);

      this.entry = entry;

      handler(entry);
    });
  }

  sync(entry: NavigationEntry) {
    if (this.entry.equals(entry)) {
      return;
    }

    this.entry = entry;

    const parameters: Record<string, string[]> = {};

    for (const key of new Set(entry.location.searchParams.keys())) {
      parameters[key] = entry.location.searchParams.getAll(key);
    }

    google.script.history.push(
      entry.state,
      parameters,
      entry.location.hash.normalize(),
    );
  }

  current() {
    return this.entry;
  }
}
