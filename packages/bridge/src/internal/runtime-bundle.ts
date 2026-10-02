export const APPS_SCRIPT_BRIDGE_RUNTIME_BUNDLE = String.raw`
(function () {
  var config = window.__GASBOOST_BRIDGE__;
  var params = new URLSearchParams(window.location.search);
  var token = params.get("gasboostBridgeToken") || config.token || "";
  var origins = new Set(config.allowedOrigins || []);
  var ready = { type: "gasboost:bridge-ready", token: token };

  window.addEventListener("message", function (event) {
    var data = event.data;

    if (!origins.has(event.origin)) {
      return;
    }

    if (
      !data ||
      data.type !== "gasboost:request" ||
      data.token !== token ||
      typeof data.id !== "string" ||
      typeof data.method !== "string"
    ) {
      return;
    }

    var runner = google.script.run
      .withSuccessHandler(function (result) {
        window.top.postMessage(
          {
            type: "gasboost:response",
            id: data.id,
            token: token,
            ok: true,
            result: result,
          },
          event.origin
        );
      })
      .withFailureHandler(function (error) {
        window.top.postMessage(
          {
            type: "gasboost:response",
            id: data.id,
            token: token,
            ok: false,
            error: {
              name: error && error.name ? String(error.name) : "Error",
              message: error && error.message ? String(error.message) : String(error),
              stack: error && error.stack ? String(error.stack) : null,
            },
          },
          event.origin
        );
      });

    if ("input" in data) {
      runner[data.method](data.input);
      return;
    }

    runner[data.method]();
  });

  origins.forEach(function (origin) {
    window.top.postMessage(ready, origin);
  });
})();
`;
