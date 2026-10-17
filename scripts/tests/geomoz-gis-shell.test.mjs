import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const script = readFileSync("scripts/assets/geomoz-gis-shell.js", "utf8");
const shell = readFileSync("scripts/assets/geomoz-gis-shell.html", "utf8");
const css = readFileSync("scripts/assets/geolibre-geomoz-theme.css", "utf8");

function simulatedSession({ nativeReady = true, disabled = false } = {}) {
  const events = new Map();
  const calls = [];
  const status = { textContent: "" };
  const menus = ["Project", "Edit", "View", "Add Data", "Processing", "Controls", "Plugins", "Settings"]
    .map((name) => ({
      textContent: name,
      disabled: disabled && name === "Processing",
      getAttribute: () => null,
      click: () => calls.push(name)
    }));
  const document = {
    addEventListener(name, callback) { events.set(name, callback); },
    querySelector() {
      if (!nativeReady) return null;
      return { querySelectorAll: () => menus };
    },
    getElementById: (id) => id === "geomoz-gis-command-status" ? status : null
  };
  runInNewContext(script, { document });
  return {
    calls,
    status,
    clickMenu(name) {
      const button = { getAttribute: () => name };
      events.get("click")({ target: { closest: () => button } });
    }
  };
}

test("GeoMoz toolbar calls original working GeoLibre menus", () => {
  const s = simulatedSession();
  for (const menu of ["Project", "Add Data", "Edit", "View", "Processing", "Controls", "Plugins", "Settings"]) {
    s.clickMenu(menu);
  }
  assert.deepEqual(s.calls, ["Project", "Add Data", "Edit", "View", "Processing", "Controls", "Plugins", "Settings"]);
  assert.equal(s.status.textContent, "");
});

test("No fake GIS operation when a native menu has not mounted or is disabled", () => {
  const missing = simulatedSession({ nativeReady: false });
  missing.clickMenu("Processing");
  assert.deepEqual(missing.calls, []);
  assert.match(missing.status.textContent, /menu SIG/);
  const blocked = simulatedSession({ disabled: true });
  blocked.clickMenu("Processing");
  assert.deepEqual(blocked.calls, []);
  assert.match(blocked.status.textContent, /menu SIG/);
});

test("Module navigation belongs to GeoMoz and the original GIS map stays mounted", () => {
  assert.match(shell, /href="\/dashboard"/);
  assert.match(shell, /href="\/mapa"/);
  assert.match(shell, /href="\/gis-workspace\/" aria-current="page"/);
  assert.match(shell, /href="\/analises"/);
  assert.match(shell, /href="\/hidrografia"/);
  assert.match(shell, /href="\/geomoz-ai"/);
  assert.doesNotMatch(shell, /<iframe\b|Voltar ao GeoMoz/);
  assert.match(css, /body > #root/);
  assert.match(css, /data-workspace-row/);
  assert.match(css, /prefers-reduced-motion/);
});
