import type {
  GoogleScriptHistoryEvent,
  GoogleScriptUrlLocation,
} from "../google";

import { HashProperty } from "./HashProperty";
import { NavigationLocation } from "./NavigationLocation";

export class NavigationEntry {
  constructor(
    readonly state: Record<string, unknown>,
    readonly location: NavigationLocation,
  ) {}

  static fromGoogle(
    source: GoogleScriptHistoryEvent | GoogleScriptUrlLocation,
  ) {
    const location = "location" in source ? source.location : source;
    const state = "state" in source ? source.state : {};

    const searchParams = new URLSearchParams();

    for (const [key, values] of Object.entries(location.parameters)) {
      for (const value of values) {
        searchParams.append(key, value);
      }
    }

    return new NavigationEntry(
      state,
      new NavigationLocation(new HashProperty(location.hash), searchParams),
    );
  }

  equals(other: NavigationEntry) {
    const equalsState = (left: unknown, right: unknown): boolean => {
      if (Object.is(left, right)) {
        return true;
      }

      if (
        typeof left !== "object" ||
        left === null ||
        typeof right !== "object" ||
        right === null
      ) {
        return false;
      }

      if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right)) {
          return false;
        }

        return (
          left.length === right.length &&
          left.every((value, index) => equalsState(value, right[index]))
        );
      }

      const leftObject = left as Record<string, unknown>;
      const rightObject = right as Record<string, unknown>;

      const leftKeys = Object.keys(leftObject);
      const rightKeys = Object.keys(rightObject);

      return (
        leftKeys.length === rightKeys.length &&
        leftKeys.every(
          (key) =>
            Object.hasOwn(rightObject, key) &&
            equalsState(leftObject[key], rightObject[key]),
        )
      );
    };

    return (
      equalsState(this.state, other.state) &&
      this.location.equals(other.location)
    );
  }
}
