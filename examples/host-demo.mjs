import { readFile } from "node:fs/promises";
import { AddonHost } from "../src/index.js";
import notifier from "./addons/hello/index.mjs";

const manifest = JSON.parse(await readFile(new URL("./addons/hello/addon.json", import.meta.url), "utf8"));
const host = new AddonHost({ onNotification: (item) => console.log(`  [${item.level}] ${item.title} — ${item.message}`) });

host.install(manifest, notifier);
await host.enable(manifest.id);
console.log("Orbit demo : plugin activé.");
host.emit("message:sent", { text: "Hello, add-ons!" });
await host.activateRecoveryMode();
console.log(`Mode récupération activé ; statut du plugin : ${host.get(manifest.id).status}.`);
console.log(`Erreurs enregistrées : ${host.getErrors().length}.`);
