export class HashProperty {
  constructor(private readonly value: string) {}

  normalize() {
    if (!this.value) return "#/";
    if (this.value.startsWith("#/")) return this.value;
    if (this.value.startsWith("#")) return `#/${this.value.slice(1)}`;
    if (this.value.startsWith("/")) return `#${this.value}`;

    return `#/${this.value}`;
  }

  equals(other: HashProperty) {
    return this.normalize() === other.normalize();
  }

  toString() {
    return this.normalize();
  }
}
