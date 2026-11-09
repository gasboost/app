// @vitest-environment jsdom
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { BootstrapProvider, useBootstrap } from "../src/react";
import type { BootstrapPublicState } from "../src/BootstrapPublicState";

afterEach(cleanup);

describe("bootstrap React state", () => {
  it.each([false, true])("reads the HTML initial state: %s", (initialized) => {
    const { result } = renderHook(() => useBootstrap(), {
      wrapper: ({ children }) => (
        <BootstrapProvider initialState={{ initialized }}>
          {children}
        </BootstrapProvider>
      ),
    });
    expect(result.current.initialized).toBe(initialized);
    expectTypeOf(result.current.initialized).toEqualTypeOf<boolean>();
    expectTypeOf(result.current.setInitialized).toEqualTypeOf<
      (initialized: boolean) => void
    >();
  });

  it("updates all consumers and preserves the input snapshot", () => {
    const initialState = Object.freeze({ initialized: false });
    let setInitialized!: (initialized: boolean) => void;
    function Consumer({ name }: { name: string }) {
      const state = useBootstrap();
      setInitialized = state.setInitialized;
      return <span data-testid={name}>{String(state.initialized)}</span>;
    }
    render(
      <StrictMode>
        <BootstrapProvider initialState={initialState}>
          <Consumer name="a" />
          <Consumer name="b" />
        </BootstrapProvider>
      </StrictMode>,
    );
    expect(screen.getByTestId("a").textContent).toBe("false");
    expect(screen.getByTestId("b").textContent).toBe("false");
    act(() => setInitialized(true));
    expect(screen.getByTestId("a").textContent).toBe("true");
    expect(screen.getByTestId("b").textContent).toBe("true");
    act(() => setInitialized(false));
    expect(screen.getByTestId("a").textContent).toBe("false");
    expect(screen.getByTestId("b").textContent).toBe("false");
    expect(initialState).toEqual({ initialized: false });
  });

  it("requires a provider", () => {
    expect(() => renderHook(() => useBootstrap())).toThrow(
      "useBootstrap must be used within BootstrapProvider.",
    );
  });

  it.each([
    undefined,
    null,
    {},
    { initialized: undefined },
    { initialized: null },
    { initialized: "false" },
    { initialized: 0 },
    false,
    [],
  ])("rejects invalid or missing initialState: %s", (initialState) => {
    expect(() =>
      render(
        <BootstrapProvider
          initialState={initialState as unknown as BootstrapPublicState}
        >
          child
        </BootstrapProvider>,
      ),
    ).toThrow(
      "BootstrapProvider requires initialState with a boolean initialized field.",
    );
  });

  it("uses initialState once and keeps updates through parent rerenders", () => {
    let state!: ReturnType<typeof useBootstrap>;
    function Consumer() {
      state = useBootstrap();
      return null;
    }
    const view = render(
      <BootstrapProvider initialState={{ initialized: false }}>
        <Consumer />
      </BootstrapProvider>,
    );
    const setInitialized = state.setInitialized;
    act(() => state.setInitialized(true));
    view.rerender(
      <BootstrapProvider initialState={{ initialized: false }}>
        <Consumer />
      </BootstrapProvider>,
    );
    expect(state.initialized).toBe(true);
    expect(state.setInitialized).toBe(setInitialized);
  });

  it("isolates sibling and nested providers", () => {
    const values = new Map<string, ReturnType<typeof useBootstrap>>();
    function Consumer({ name }: { name: string }) {
      values.set(name, useBootstrap());
      return null;
    }
    render(
      <>
        <BootstrapProvider initialState={{ initialized: false }}>
          <Consumer name="outer" />
          <BootstrapProvider initialState={{ initialized: true }}>
            <Consumer name="inner" />
          </BootstrapProvider>
        </BootstrapProvider>
        <BootstrapProvider initialState={{ initialized: false }}>
          <Consumer name="sibling" />
        </BootstrapProvider>
      </>,
    );
    act(() => values.get("outer")!.setInitialized(true));
    expect(values.get("outer")!.initialized).toBe(true);
    expect(values.get("sibling")!.initialized).toBe(false);
    act(() => values.get("inner")!.setInitialized(false));
    expect(values.get("inner")!.initialized).toBe(false);
    expect(values.get("outer")!.initialized).toBe(true);
  });
});
