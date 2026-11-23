import test from "node:test";
import assert from "node:assert/strict";
import { AddonHost, CapabilityError } from "../src/index.js";

const manifest = (overrides = {}) => ({
  schemaVersion: 1,
  id: "sample-plugin",
  name: "Sample Plugin",
  version: "1.0.0",
  description: "Plugin utilisé par les tests du runtime.",
  kind: "plugin",
  capabilities: [],
  ...overrides,
});

const fixedClock = () => new Date("2026-01-02T03:04:05.000Z");

test("démarre puis arrête un plugin proprement", async () => {
  const calls = [];
  const host = new AddonHost();
  host.install(manifest(), {
    start(context) { calls.push(`start:${context.addon.id}`); },
    stop() { calls.push("stop"); },
  });

  assert.equal((await host.enable("sample-plugin")).status, "enabled");
  assert.equal((await host.disable("sample-plugin")).status, "installed");
  assert.deepEqual(calls, ["start:sample-plugin", "stop"]);
});

test("refuse une API dont la capacité n’a pas été demandée", async () => {
  let context;
  const host = new AddonHost();
  host.install(manifest(), { start(value) { context = value; } });
  await host.enable("sample-plugin");
  assert.throws(() => context.storage.set("secret", "x"), CapabilityError);
});

test("isole et copie les valeurs du stockage par plugin", async () => {
  const contexts = new Map();
  const host = new AddonHost();
  host.install(manifest({ capabilities: ["storage"] }), { start(ctx) { contexts.set(ctx.addon.id, ctx); } });
  host.install(manifest({ id: "other-plugin", capabilities: ["storage"] }), { start(ctx) { contexts.set(ctx.addon.id, ctx); } });
  await host.startAll();

  const input = { nested: [1] };
  contexts.get("sample-plugin").storage.set("prefs", input);
  input.nested.push(2);
  assert.deepEqual(contexts.get("sample-plugin").storage.get("prefs"), { nested: [1] });
  assert.equal(contexts.get("other-plugin").storage.get("prefs"), undefined);
});

test("désabonne automatiquement les rappels à l’arrêt", async () => {
  let calls = 0;
  const host = new AddonHost();
  host.install(manifest({ capabilities: ["events"] }), {
    start(context) { context.events.subscribe("ping", () => calls++); },
  });
  await host.enable("sample-plugin");
  host.emit("ping", {});
  await host.disable("sample-plugin");
  host.emit("ping", {});
  assert.equal(calls, 1);
});

test("capture l’erreur d’un plugin sans désactiver les autres", async () => {
  const host = new AddonHost();
  host.install(manifest(), { start() { throw new Error("boom"); } });
  host.install(manifest({ id: "healthy-plugin" }), { start() {} });

  const [broken, healthy] = await host.startAll();
  assert.equal(broken.status, "error");
  assert.equal(healthy.status, "enabled");
  assert.equal(host.getErrors()[0].message, "boom");
});

test("met en quarantaine un rappel défaillant et continue le dispatch", async () => {
  let healthyCalls = 0;
  const host = new AddonHost();
  host.install(manifest({ capabilities: ["events"] }), {
    start(context) { context.events.subscribe("tick", () => { throw new Error("callback failed"); }); },
  });
  host.install(manifest({ id: "healthy-plugin", capabilities: ["events"] }), {
    start(context) { context.events.subscribe("tick", () => healthyCalls++); },
  });
  await host.startAll();
  host.emit("tick", { n: 1 });
  assert.equal(healthyCalls, 1);
  assert.equal(host.getErrors()[0].phase, "event:tick");
});

test("le mode récupération arrête les plugins et bloque les activations", async () => {
  const host = new AddonHost();
  host.install(manifest(), { start() {}, stop() {} });
  await host.enable("sample-plugin");
  await host.activateRecoveryMode();
  assert.equal(host.recoveryMode, true);
  assert.equal(host.get("sample-plugin").status, "installed");
  await assert.rejects(host.enable("sample-plugin"), /mode de récupération/);
  host.exitRecoveryMode();
  assert.equal((await host.enable("sample-plugin")).status, "enabled");
});

test("active seulement un thème validé", () => {
  const host = new AddonHost();
  host.install({
    schemaVersion: 1,
    id: "midnight-theme",
    name: "Midnight",
    version: "1.0.0",
    description: "Une palette sombre pour l’application hôte.",
    kind: "theme",
    capabilities: [],
    theme: { tokens: { background: "#10131a", accent: "#76e4c2" } },
  });
  assert.equal(host.activateTheme("midnight-theme").tokens.accent, "#76e4c2");
  assert.throws(() => host.activateTheme("missing"), /inconnue/);
});

test("horodate les notifications et les livre à l’hôte", async () => {
  const received = [];
  const host = new AddonHost({ onNotification: (item) => received.push(item), clock: fixedClock });
  host.install(manifest({ capabilities: ["notifications"] }), {
    start(context) { context.notifications.show({ title: "OK", message: "Test" }); },
  });
  await host.enable("sample-plugin");
  assert.equal(received[0].at, "2026-01-02T03:04:05.000Z");
  assert.equal(host.getNotifications().length, 1);
});

test("nettoie les écouteurs après un démarrage raté avant de réessayer", async () => {
  let shouldFail = true;
  let calls = 0;
  let cleanupCalls = 0;
  const host = new AddonHost();
  host.install(manifest({ capabilities: ["events"] }), {
    start(context) {
      context.events.subscribe("retry", () => calls++);
      if (shouldFail) {
        shouldFail = false;
        throw new Error("temporary failure");
      }
    },
    stop() { cleanupCalls++; },
  });

  assert.equal((await host.enable("sample-plugin")).status, "error");
  assert.equal(cleanupCalls, 1);
  assert.equal((await host.enable("sample-plugin")).status, "enabled");
  host.emit("retry", {});
  assert.equal(calls, 1);
});

test("supprime les données isolées lors de la désinstallation", async () => {
  let context;
  const host = new AddonHost();
  host.install(manifest({ capabilities: ["storage"] }), { start(value) { context = value; } });
  await host.enable("sample-plugin");
  context.storage.set("preference", "saved");
  await host.disable("sample-plugin", { uninstall: true });
  assert.equal(host.get("sample-plugin"), null);

  host.install(manifest({ capabilities: ["storage"] }), { start(value) { context = value; } });
  await host.enable("sample-plugin");
  assert.equal(context.storage.get("preference"), undefined);
});
