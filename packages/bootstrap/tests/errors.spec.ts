import { expect, expectTypeOf, it } from "vitest";
import {
  BOOTSTRAP_ERROR_CODES,
  BootstrapError,
  type BootstrapErrorCode,
} from "../src/errors";

it("exposes typed public codes and an object-only Error constructor", () => {
  const error = new BootstrapError({
    code: BOOTSTRAP_ERROR_CODES.INVALID_TOKEN,
    message: "Invalid bootstrap token",
  });
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({
    name: "BootstrapError",
    code: "INVALID_TOKEN",
    message: "Invalid bootstrap token",
  });
  expect(Object.isFrozen(BOOTSTRAP_ERROR_CODES)).toBe(true);
  expectTypeOf(error.code).toEqualTypeOf<BootstrapErrorCode>();
  if (false) {
    // @ts-expect-error Only known bootstrap codes are accepted.
    new BootstrapError({ code: "DATABASE_SECRET", message: "invalid" });
    // @ts-expect-error The constructor requires one object.
    new BootstrapError("INVALID_TOKEN", "invalid");
    // @ts-expect-error Error codes are readonly.
    error.code = BOOTSTRAP_ERROR_CODES.LOCKED;
  }
});
