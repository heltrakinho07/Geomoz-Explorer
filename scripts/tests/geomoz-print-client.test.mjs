import test from "node:test";
import assert from "node:assert/strict";
import { requestPrintFirebaseToken, submitGeoMozPrint } from "../assets/workbench/geomoz-print-client.ts";

function setup(reply) {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const oldFetch = globalThis.fetch;
  const listeners = new Set();
  const origin = "https://geomoz.geolithica.com";
  const frame = {
    contentWindow: {
      postMessage(message, targetOrigin) {
        assert.equal(targetOrigin, origin);
        queueMicrotask(() => reply(message, frame, event => {
          for (const fn of listeners) fn(event);
        }));
      },
    },
  };
  globalThis.window = {
    location: { origin },
    addEventListener: (type, fn) => { if (type === "message") listeners.add(fn); },
    removeEventListener: (type, fn) => { if (type === "message") listeners.delete(fn); },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  };
  globalThis.document = { querySelector: () => frame };
  return {
    origin, frame, listeners,
    restore: () => {
      globalThis.window = oldWindow;
      globalThis.document = oldDocument;
      globalThis.fetch = oldFetch;
    },
  };
}

test("same-origin token bridge rejects forged-origin messages", async () => {
  const fake = setup((request, frame, send) => {
    send({ origin: "https://attacker.example", source: frame.contentWindow,
           data: { type: "geomoz:workspace-print-token-response", id: request.id, token: "EvilBearer123456789000" } });
    send({ origin: fake.origin, source: {},
           data: { type: "geomoz:workspace-print-token-response", id: request.id, token: "ForgedBearer12345678900" } });
    send({ origin: fake.origin, source: frame.contentWindow,
           data: { type: "geomoz:workspace-print-token-response", id: request.id, token: "ValidFirebaseBearer123456789000" } });
  });
  try {
    assert.equal(await requestPrintFirebaseToken(), "ValidFirebaseBearer123456789000");
    assert.equal(fake.listeners.size, 0, "message handler must be cleaned");
  } finally {
    fake.restore();
  }
});

test("print client submits Firebase authorization without ever exposing worker token", async () => {
  const fake = setup((request, frame, send) => {
    send({ origin: fake.origin, source: frame.contentWindow,
           data: { type: "geomoz:workspace-print-token-response", id: request.id, token: "ValidFirebaseBearer123456789000" } });
  });
  const id = "a".repeat(32);
  const seen = [];
  globalThis.fetch = async (url, options) => {
    seen.push({ url, ...options });
    if (url === "/geomoz-api/v1/prints") {
      return {
        ok: true, json: async () => ({
          id, status: "succeeded", statusUrl: "/geomoz-api/v1/prints/" + id,
          resultUrl: "/geomoz-api/v1/prints/" + id + "/result",
        }),
      };
    }
    return {
      ok: true,
      headers: { get: () => "application/pdf" },
      blob: async () => new Blob([new TextEncoder().encode("%PDF-1.7\n" + "x".repeat(100))],
                                 { type: "application/pdf" }),
    };
  };
  try {
    const output = await submitGeoMozPrint({schema:1,engine:"cartopy"}, () => {});
    assert.equal(output.type, "application/pdf");
    assert.equal(seen.length, 2);
    assert.equal(seen[0].url, "/geomoz-api/v1/prints");
    assert.equal(seen[0].headers.Authorization, "Bearer ValidFirebaseBearer123456789000");
    assert.match(seen[0].headers["Idempotency-Key"], /^[A-Za-z0-9_-]{16,80}$/);
    assert.equal(seen[0].credentials, "omit");
    assert.equal(seen[1].url, "/geomoz-api/v1/prints/" + id + "/result");
    assert.ok(!JSON.stringify(seen).includes("GEOMOZ_PRINT_WORKER_TOKEN"));
  } finally {
    fake.restore();
  }
});
