export type AddonKind = "plugin" | "theme" | "font" | "icon-pack";
export type Capability = "storage" | "notifications" | "events";
export type AddonStatus = "installed" | "enabled" | "error";
export type ThemeToken =
  | "background"
  | "surface"
  | "surfaceRaised"
  | "text"
  | "textMuted"
  | "accent"
  | "border"
  | "success"
  | "danger";

export interface AddonManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  description: string;
  kind: AddonKind;
  capabilities: Capability[];
  autoStart?: boolean;
  theme?: { tokens: Partial<Record<ThemeToken, string>> };
  font?: { family: string };
  icons?: Record<string, string>;
}

export interface AddonContext {
  readonly addon: Readonly<{ id: string; name: string; version: string }>;
  readonly storage: {
    get<T = unknown>(key: string): T | undefined;
    set<T>(key: string, value: T): void;
    delete(key: string): boolean;
  };
  readonly notifications: {
    show(notification: { title: string; message: string; level?: "info" | "success" | "warning" | "error" }): object;
  };
  readonly events: {
    subscribe<T = unknown>(eventName: string, callback: (payload: T) => void): () => void;
    publish<T = unknown>(eventName: string, payload: T): number;
  };
}

export interface AddonImplementation {
  start?(context: AddonContext): void | Promise<void>;
  stop?(): void | Promise<void>;
}

export interface InstalledAddon {
  readonly manifest: AddonManifest;
  readonly status: AddonStatus;
  readonly error: { phase: string; message: string; at: string } | null;
}

export interface ActiveTheme {
  id: string;
  name: string;
  tokens: Partial<Record<ThemeToken, string>>;
}

export class CapabilityError extends Error {
  constructor(addonId: string, capability: Capability);
}

export class ManifestValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]);
}

export class AddonHost {
  constructor(options?: { onNotification?: (notification: object) => void; clock?: () => Date });
  readonly recoveryMode: boolean;
  readonly activeTheme: ActiveTheme | null;
  install(manifest: AddonManifest, implementation?: AddonImplementation): InstalledAddon;
  get(id: string): InstalledAddon | null;
  list(): InstalledAddon[];
  enable(id: string): Promise<InstalledAddon>;
  disable(id: string, options?: { uninstall?: boolean }): Promise<InstalledAddon | null>;
  startAll(): Promise<InstalledAddon[]>;
  shutdown(): Promise<void>;
  activateRecoveryMode(): Promise<InstalledAddon[]>;
  exitRecoveryMode(): void;
  activateTheme(id: string): ActiveTheme;
  emit<T = unknown>(eventName: string, payload: T): number;
  getErrors(): Array<{ addonId: string; phase: string; message: string; at: string }>;
  getNotifications(): object[];
}

export const ADDON_KINDS: readonly AddonKind[];
export const CAPABILITIES: readonly Capability[];
export function validateManifest(input: unknown): string[];
export function assertValidManifest(input: unknown): Readonly<AddonManifest>;
