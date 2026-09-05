import { HashProperty } from "./HashProperty";

export class NavigationLocation {
  constructor(
    readonly hash: HashProperty,
    readonly searchParams: URLSearchParams,
  ) {}

  equals(other: NavigationLocation) {
    const thisHash = this.hash.normalize().split("?")[0];
    const otherHash = other.hash.normalize().split("?")[0];

    if (thisHash !== otherHash) {
      return false;
    }

    const thisKeys = [...new Set(this.searchParams.keys())].sort();
    const otherKeys = [...new Set(other.searchParams.keys())].sort();

    if (thisKeys.length !== otherKeys.length) {
      return false;
    }

    return thisKeys.every((key, index) => {
      if (key !== otherKeys[index]) {
        return false;
      }

      const thisValues = this.searchParams.getAll(key);
      const otherValues = other.searchParams.getAll(key);

      return (
        thisValues.length === otherValues.length &&
        thisValues.every(
          (value, valueIndex) => value === otherValues[valueIndex],
        )
      );
    });
  }

  private normalizeSearchParams(searchParams: URLSearchParams) {
    const keys = [...new Set(searchParams.keys())].sort();

    const normalized = new URLSearchParams();

    for (const key of keys) {
      for (const value of searchParams.getAll(key)) {
        normalized.append(key, value);
      }
    }

    return normalized.toString();
  }
}
