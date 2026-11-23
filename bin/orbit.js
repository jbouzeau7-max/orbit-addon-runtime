#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateManifest } from "../src/manifest.js";

const [command, ...args] = process.argv.slice(2);

async function main() {
  if (command === "validate") {
    const file = args[0];
    if (!file) throw new Error("Usage : orbit-addon validate <addon.json>");
    const absolute = path.resolve(file);
    let manifest;
    try {
      manifest = JSON.parse(await readFile(absolute, "utf8"));
    } catch (error) {
      throw new Error(`Impossible de lire le JSON : ${error.message}`);
    }
    const issues = validateManifest(manifest);
    if (issues.length) {
      console.error(`✗ ${issues.length} problème(s) dans ${absolute}`);
      for (const issue of issues) console.error(`  - ${issue}`);
      process.exitCode = 1;
      return;
    }
    console.log(`✓ ${manifest.name} (${manifest.id}) — manifeste valide`);
    return;
  }

  if (command === "init") {
    const slug = args[0];
    if (!slug || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error("Usage : orbit-addon init <identifiant-en-minuscules>");
    }
    const directory = path.resolve(process.cwd(), slug);
    const manifest = {
      schemaVersion: 1,
      id: slug,
      name: slug.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" "),
      version: "0.1.0",
      description: "Describe what this add-on does.",
      kind: "plugin",
      capabilities: [],
    };
    await mkdir(directory, { recursive: false });
    await writeFile(path.join(directory, "addon.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    await writeFile(path.join(directory, "index.mjs"), `export default {\n  start(context) {\n    console.log(\`Started \${context.addon.name}\`);\n  },\n  stop() {\n    console.log("Stopped cleanly");\n  },\n};\n`, { flag: "wx" });
    const readme = [
      `# ${manifest.name}`,
      "",
      "A starter add-on for an Orbit-compatible host.",
      "",
      "- Review addon.json and request only the capabilities you use.",
      "- Export start(context) and optionally stop() from index.mjs.",
      `- Validate with orbit-addon validate ${slug}/addon.json.`,
      "",
      "The host must load and register this module explicitly. Orbit never evaluates downloaded code.",
      "",
    ].join("\n");
    await writeFile(path.join(directory, "README.md"), readme, { flag: "wx" });
    console.log(`✓ Squelette créé dans ${directory}`);
    console.log(`  cd ${slug} && orbit-addon validate addon.json`);
    return;
  }

  if (command === "help" || !command) {
    console.log("Orbit Add-on CLI\n\n  orbit-addon init <slug>       Créer le squelette d’un plugin\n  orbit-addon validate <file>   Valider un manifeste JSON\n  orbit-addon help              Afficher cette aide");
    return;
  }

  throw new Error(`Commande inconnue : ${command}. Utilisez « orbit-addon help ».`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(`Erreur : ${error.message}`);
    process.exitCode = 1;
  });
}
