import test from "node:test";
import assert from "node:assert/strict";
import { assertValidManifest, validateManifest } from "../src/manifest.js";

const valid = {
  schemaVersion: 1,
  id: "hello-world",
  name: "Hello World",
  version: "1.2.3",
  description: "Une extension de test valide.",
  kind: "plugin",
  capabilities: [],
};

test("accepte un manifeste minimal valide et renvoie une copie", () => {
  const result = assertValidManifest(valid);
  assert.equal(result.id, valid.id);
  assert.notEqual(result, valid);
});

test("rejette les identifiants ambigus et les capacités inconnues", () => {
  const issues = validateManifest({ ...valid, id: "../bad", capabilities: ["filesystem"] });
  assert.equal(issues.length, 2);
});

test("rejette une couleur de thème injectée hors liste blanche", () => {
  const issues = validateManifest({
    ...valid,
    id: "unsafe-theme",
    name: "Unsafe Theme",
    kind: "theme",
    theme: { tokens: { background: "url(https://example.test/x)" } },
  });
  assert.ok(issues.some((issue) => issue.includes("Valeur de couleur invalide")));
});

test("rejette les champs non conformes à SemVer", () => {
  assert.ok(validateManifest({ ...valid, version: "latest" }).some((issue) => issue.includes("SemVer")));
});
