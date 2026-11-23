import { assertValidManifest } from "./manifest.js";

export class CapabilityError extends Error {
  constructor(addonId, capability) {
    super(`L’extension « ${addonId} » n’a pas demandé la permission « ${capability} ».`);
    this.name = "CapabilityError";
  }
}

export class AddonHost {
  #addons = new Map();
  #storage = new Map();
  #listeners = new Map();
  #errors = [];
  #notifications = [];
  #recoveryMode = false;
  #activeTheme = null;
  #onNotification;

  constructor({ onNotification = () => {}, clock = () => new Date() } = {}) {
    this.#onNotification = onNotification;
    this.clock = clock;
  }

  get recoveryMode() {
    return this.#recoveryMode;
  }

  get activeTheme() {
    return this.#activeTheme ? structuredClone(this.#activeTheme) : null;
  }

  install(manifestInput, implementation = {}) {
    const manifest = assertValidManifest(manifestInput);
    if (this.#addons.has(manifest.id)) throw new Error(`Une extension « ${manifest.id} » est déjà installée.`);
    if (manifest.kind === "plugin" && (!implementation || typeof implementation !== "object")) {
      throw new TypeError("L’implémentation du plugin doit être un objet.");
    }
    this.#addons.set(manifest.id, {
      manifest,
      implementation,
      status: "installed",
      error: null,
    });
    return this.get(manifest.id);
  }

  get(id) {
    const addon = this.#addons.get(id);
    if (!addon) return null;
    return Object.freeze({
      manifest: structuredClone(addon.manifest),
      status: addon.status,
      error: addon.error ? { ...addon.error } : null,
    });
  }

  list() {
    return [...this.#addons.keys()].map((id) => this.get(id));
  }

  async enable(id) {
    if (this.#recoveryMode) throw new Error("Le mode de récupération bloque l’activation des extensions.");
    const addon = this.#requireAddon(id);
    if (addon.manifest.kind !== "plugin") throw new Error(`« ${id} » n’est pas un plugin exécutable.`);
    if (addon.status === "enabled") return this.get(id);

    try {
      if (typeof addon.implementation.start === "function") {
        await addon.implementation.start(this.#createContext(addon));
      }
      addon.status = "enabled";
      addon.error = null;
    } catch (error) {
      this.#removeListeners(id);
      if (typeof addon.implementation.stop === "function") {
        try {
          await addon.implementation.stop();
        } catch (cleanupError) {
          this.#recordError(addon, "cleanup", cleanupError);
        }
      }
      this.#recordError(addon, "start", error);
      addon.status = "error";
    }
    return this.get(id);
  }

  async disable(id, { uninstall = false } = {}) {
    const addon = this.#requireAddon(id);
    if (addon.status === "enabled" && typeof addon.implementation.stop === "function") {
      try {
        await addon.implementation.stop();
      } catch (error) {
        this.#recordError(addon, "stop", error);
      }
    }
    this.#removeListeners(id);
    addon.status = "installed";
    if (uninstall) {
      this.#addons.delete(id);
      for (const key of this.#storage.keys()) {
        if (key.startsWith(`${id}:`)) this.#storage.delete(key);
      }
    }
    return uninstall ? null : this.get(id);
  }

  async startAll() {
    const results = [];
    for (const addon of this.#addons.values()) {
      if (addon.manifest.kind === "plugin" && addon.manifest.autoStart !== false) {
        results.push(await this.enable(addon.manifest.id));
      }
    }
    return results;
  }

  async shutdown() {
    for (const { manifest, status } of this.list()) {
      if (status === "enabled") await this.disable(manifest.id);
    }
    this.#activeTheme = null;
  }

  async activateRecoveryMode() {
    this.#recoveryMode = true;
    for (const { manifest, status } of this.list()) {
      if (status === "enabled") await this.disable(manifest.id);
    }
    this.#activeTheme = null;
    return this.list();
  }

  exitRecoveryMode() {
    this.#recoveryMode = false;
  }

  activateTheme(id) {
    const addon = this.#requireAddon(id);
    if (addon.manifest.kind !== "theme") throw new Error(`« ${id} » n’est pas un thème.`);
    this.#activeTheme = { id, name: addon.manifest.name, tokens: structuredClone(addon.manifest.theme.tokens) };
    return this.activeTheme;
  }

  emit(eventName, payload) {
    if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("Le nom de l’événement est obligatoire.");
    const listeners = [...(this.#listeners.get(eventName) ?? [])];
    for (const listener of listeners) {
      const addon = this.#addons.get(listener.addonId);
      if (!addon || addon.status !== "enabled") continue;
      try {
        listener.callback(structuredClone(payload));
      } catch (error) {
        this.#recordError(addon, `event:${eventName}`, error);
      }
    }
    return listeners.length;
  }

  getErrors() {
    return this.#errors.map((record) => ({ ...record }));
  }

  getNotifications() {
    return this.#notifications.map((notification) => ({ ...notification }));
  }

  #requireAddon(id) {
    const addon = this.#addons.get(id);
    if (!addon) throw new Error(`Extension inconnue : ${id}.`);
    return addon;
  }

  #requireCapability(addon, capability) {
    if (!addon.manifest.capabilities.includes(capability)) {
      throw new CapabilityError(addon.manifest.id, capability);
    }
  }

  #createContext(addon) {
    const id = addon.manifest.id;
    return Object.freeze({
      addon: Object.freeze({ id, name: addon.manifest.name, version: addon.manifest.version }),
      storage: Object.freeze({
        get: (key) => {
          this.#requireCapability(addon, "storage");
          return structuredClone(this.#storage.get(`${id}:${String(key)}`));
        },
        set: (key, value) => {
          this.#requireCapability(addon, "storage");
          this.#storage.set(`${id}:${String(key)}`, structuredClone(value));
        },
        delete: (key) => {
          this.#requireCapability(addon, "storage");
          return this.#storage.delete(`${id}:${String(key)}`);
        },
      }),
      notifications: Object.freeze({
        show: ({ title, message, level = "info" }) => {
          this.#requireCapability(addon, "notifications");
          if (typeof title !== "string" || typeof message !== "string") {
            throw new TypeError("Une notification nécessite title et message textuels.");
          }
          const item = { addonId: id, title: title.slice(0, 80), message: message.slice(0, 240), level, at: this.clock().toISOString() };
          this.#notifications.push(item);
          this.#onNotification(structuredClone(item));
          return structuredClone(item);
        },
      }),
      events: Object.freeze({
        subscribe: (eventName, callback) => {
          this.#requireCapability(addon, "events");
          if (typeof callback !== "function") throw new TypeError("Le rappel doit être une fonction.");
          const listeners = this.#listeners.get(eventName) ?? [];
          const record = { addonId: id, callback };
          listeners.push(record);
          this.#listeners.set(eventName, listeners);
          return () => this.#removeListener(eventName, record);
        },
        publish: (eventName, payload) => {
          this.#requireCapability(addon, "events");
          return this.emit(eventName, payload);
        },
      }),
    });
  }

  #removeListener(eventName, record) {
    const listeners = this.#listeners.get(eventName);
    if (!listeners) return;
    const remaining = listeners.filter((listener) => listener !== record);
    if (remaining.length) this.#listeners.set(eventName, remaining);
    else this.#listeners.delete(eventName);
  }

  #removeListeners(addonId) {
    for (const [eventName, listeners] of this.#listeners) {
      const remaining = listeners.filter((listener) => listener.addonId !== addonId);
      if (remaining.length) this.#listeners.set(eventName, remaining);
      else this.#listeners.delete(eventName);
    }
  }

  #recordError(addon, phase, error) {
    const message = error instanceof Error ? error.message : String(error);
    addon.error = { phase, message, at: this.clock().toISOString() };
    if (phase === "start") addon.status = "error";
    this.#errors.push({ addonId: addon.manifest.id, phase, message, at: addon.error.at });
  }
}
