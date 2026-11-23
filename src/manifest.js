export const ADDON_KINDS = Object.freeze(["plugin", "theme", "font", "icon-pack"]);
export const CAPABILITIES = Object.freeze(["storage", "notifications", "events"]);

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const THEME_TOKENS = new Set([
  "background",
  "surface",
  "surfaceRaised",
  "text",
  "textMuted",
  "accent",
  "border",
  "success",
  "danger",
]);
const COLOR_PATTERN = /^(#[\da-fA-F]{3,8}|rgba?\([\d.,%\s]+\)|hsla?\([\d.,%\s]+\))$/;

export class ManifestValidationError extends Error {
  constructor(issues) {
    super(`Manifest invalide :\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "ManifestValidationError";
    this.issues = issues;
  }
}

export function validateManifest(input) {
  const issues = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return ["La racine doit être un objet JSON."];
  }

  if (input.schemaVersion !== 1) issues.push("schemaVersion doit valoir 1.");
  if (typeof input.id !== "string" || !ID_PATTERN.test(input.id)) {
    issues.push("id doit être en minuscules et utiliser uniquement lettres, chiffres, points, tirets ou underscores.");
  }
  if (typeof input.name !== "string" || input.name.trim().length < 2 || input.name.length > 64) {
    issues.push("name doit contenir entre 2 et 64 caractères.");
  }
  if (typeof input.version !== "string" || !VERSION_PATTERN.test(input.version)) {
    issues.push("version doit suivre le format SemVer (ex. 1.2.3).");
  }
  if (typeof input.description !== "string" || input.description.trim().length < 8 || input.description.length > 280) {
    issues.push("description doit contenir entre 8 et 280 caractères.");
  }
  if (!ADDON_KINDS.includes(input.kind)) {
    issues.push(`kind doit être l’une de ces valeurs : ${ADDON_KINDS.join(", ")}.`);
  }
  if (!Array.isArray(input.capabilities)) {
    issues.push("capabilities doit être un tableau explicite (vide si aucune permission n’est nécessaire).");
  } else {
    if (new Set(input.capabilities).size !== input.capabilities.length) {
      issues.push("capabilities ne doit pas contenir de doublons.");
    }
    for (const capability of input.capabilities) {
      if (!CAPABILITIES.includes(capability)) issues.push(`Permission inconnue : ${String(capability)}.`);
    }
  }

  if (input.kind === "theme") {
    if (!input.theme || typeof input.theme !== "object" || Array.isArray(input.theme)) {
      issues.push("Un thème doit fournir un objet theme.");
    } else {
      const tokens = input.theme.tokens;
      if (!tokens || typeof tokens !== "object" || Array.isArray(tokens) || Object.keys(tokens).length === 0) {
        issues.push("theme.tokens doit définir au moins une couleur.");
      } else {
        for (const [token, value] of Object.entries(tokens)) {
          if (!THEME_TOKENS.has(token)) issues.push(`Jeton de thème non pris en charge : ${token}.`);
          if (typeof value !== "string" || !COLOR_PATTERN.test(value) || /url|expression|var\(/i.test(value)) {
            issues.push(`Valeur de couleur invalide pour ${token}.`);
          }
        }
      }
    }
  }

  if (input.kind === "font" && input.font !== undefined) {
    if (!input.font || typeof input.font.family !== "string" || !/^[\w -]{1,64}$/.test(input.font.family)) {
      issues.push("font.family doit être un nom simple de 1 à 64 caractères.");
    }
  }

  if (input.kind === "icon-pack" && input.icons !== undefined) {
    if (!input.icons || typeof input.icons !== "object" || Array.isArray(input.icons)) {
      issues.push("icons doit être un objet nom → symbole Unicode.");
    } else {
      for (const [name, symbol] of Object.entries(input.icons)) {
        if (!/^[a-z][a-z0-9-]{0,31}$/.test(name) || typeof symbol !== "string" || [...symbol].length > 8) {
          issues.push(`Entrée d’icône invalide : ${name}.`);
        }
      }
    }
  }

  return issues;
}

export function assertValidManifest(input) {
  const issues = validateManifest(input);
  if (issues.length) throw new ManifestValidationError(issues);
  return Object.freeze(structuredClone(input));
}
