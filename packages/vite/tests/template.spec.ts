import { describe, expect, it } from "vitest";
import { createDevPlugin } from "../src/dev";

function transformHtml({
  template,
  html,
}: {
  template?: Record<string, string>;
  html: string;
}): string {
  const plugin = createDevPlugin({
    entry: "src/server.ts",
    template,
  });

  const hook = plugin.transformIndexHtml;

  if (!hook) {
    throw new Error("transformIndexHtml hook is not defined.");
  }

  const transform = typeof hook === "function" ? hook : hook.handler;

  const result = transform.call({} as never, html, {} as never);

  if (typeof result === "string") {
    return result;
  }

  throw new Error("Expected transformIndexHtml to return string.");
}

describe("template", () => {
  it("template variableを置換する", () => {
    const html = `
<script>
  const ssr = '<?= ssr ?>';
</script>
`;

    const result = transformHtml({
      template: {
        ssr: '{"scriptId":"local-script-id"}',
      },
      html,
    });

    expect(result).toContain(`const ssr = '{"scriptId":"local-script-id"}';`);
  });

  it.each(["<?=ssr?>", "<?= ssr?>", "<?=ssr ?>", "<?= ssr ?>"])(
    "template expressionの空白差異を許容する: %s",
    (expression) => {
      const result = transformHtml({
        template: {
          ssr: "value",
        },
        html: `<div>${expression}</div>`,
      });

      expect(result).toBe("<div>value</div>");
    },
  );

  it("同一variableをすべて置換する", () => {
    const result = transformHtml({
      template: {
        value: "replaced",
      },
      html: `
<div><?= value ?></div>
<span><?= value ?></span>
<p><?= value ?></p>
`,
    });

    expect(result).toBe(`
<div>replaced</div>
<span>replaced</span>
<p>replaced</p>
`);
  });

  it("複数のtemplate variableを置換する", () => {
    const result = transformHtml({
      template: {
        user: "Tiger",
        environment: "development",
      },
      html: `
<div><?= user ?></div>
<div><?= environment ?></div>
`,
    });

    expect(result).toBe(`
<div>Tiger</div>
<div>development</div>
`);
  });

  it("templateに存在しないvariableは変更しない", () => {
    const result = transformHtml({
      template: {
        user: "Tiger",
      },
      html: `
<div><?= user ?></div>
<div><?= unknown ?></div>
`,
    });

    expect(result).toBe(`
<div>Tiger</div>
<div><?= unknown ?></div>
`);
  });

  it("template未指定ではHTMLを変更しない", () => {
    const html = `
<div><?= ssr ?></div>
`;

    expect(
      transformHtml({
        html,
      }),
    ).toBe(html);
  });

  it("valueをserializeせずそのまま挿入する", () => {
    const value = `{"enabled":true,"count":10}`;

    const result = transformHtml({
      template: {
        config: value,
      },
      html: `<script>const config = '<?= config ?>';</script>`,
    });

    expect(result).toBe(
      `<script>const config = '{"enabled":true,"count":10}';</script>`,
    );
  });

  it("正規表現の特殊文字を含むvariable名も置換できる", () => {
    const result = transformHtml({
      template: {
        "app.config": "development",
      },
      html: `<div><?= app.config ?></div>`,
    });

    expect(result).toBe("<div>development</div>");
  });
});
