import type { ScriptDef } from "./host";
import { networkHosts } from "./types";

/**
 * Plugin scripts (manifest "main"): each plugin runs in its own Web Worker with no DOM, no network
 * and no access to BBForge. The only way out is the `bb` object handed to its functions; every
 * `bb` call comes here as a message and is checked against the plugin's permissions (the desktop
 * side checks network, windows and storage once more against the installed package).
 *
 *   exports.myCommand = async (bb, args) => { … }
 */

export interface ScriptBackend {
  httpGet(plugin: string, url: string, cookies?: Record<string, string>): Promise<{ status: number; contentType: string; body: string }>;
  windowOpen(plugin: string, url: string, title?: string): Promise<string>;
  windowCookies(plugin: string, label: string, names: string[], ignore?: string[], timeoutMs?: number): Promise<Record<string, string>>;
  windowClose(plugin: string, label: string): Promise<void>;
  windowClearData(plugin: string): Promise<void>;
  storageGet(plugin: string, key: string): Promise<unknown>;
  storageSet(plugin: string, key: string, value: unknown): Promise<void>;
}
export interface PromptOptions { title?: string; label?: string; placeholder?: string; hint?: string; value?: string }
export interface ReviewOptions { title?: string; text: string; hint?: string }
export interface CommandPatch { title?: string; icon?: string; hint?: string }
export interface ScriptUi {
  /** Changes how one of the plugin's own commands looks (menus, palette, buttons). */
  updateCommand(owner: string, id: string, patch: CommandPatch): void;
  prompt(owner: string, options: PromptOptions): Promise<string | null>;
  review(owner: string, options: ReviewOptions): Promise<"insert" | "copy" | null>;
  notify(owner: string, text: string): void;
}
/** What a run may do with the document: the selection when the command started, and insertion there. */
export interface ScriptContext { selection: string; insert(text: string): void }

interface Run { resolve(value: unknown): void; reject(error: Error): void; context: ScriptContext; depth: number }
interface Instance { worker: Worker; runs: Map<number, Run>; lastBeat: number; script: ScriptDef }

const LOCKED = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "WebTransport", "importScripts", "indexedDB", "caches", "Worker", "SharedWorker", "BroadcastChannel", "RTCPeerConnection", "postMessage"];
const BOOTSTRAP = `"use strict";
const __bb = (() => {
  const post = self.postMessage.bind(self), pending = new Map();
  let seq = 0;
  const call = (run, method, args) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); post({ type: "call", id, run, method, args }); });
  const api = (run) => Object.freeze({
    http: Object.freeze({ get: (url, options = {}) => call(run, "http.get", [String(url), options]) }),
    window: Object.freeze({
      open: (url, options = {}) => call(run, "window.open", [String(url), options]),
      waitForCookies: (handle, names, options = {}) => call(run, "window.waitForCookies", [handle, names, options]),
      close: (handle) => call(run, "window.close", [handle]),
      clearData: () => call(run, "window.clearData", []),
    }),
    storage: Object.freeze({ get: (key) => call(run, "storage.get", [String(key)]), set: (key, value) => call(run, "storage.set", [String(key), value === undefined ? null : value]), remove: (key) => call(run, "storage.set", [String(key), null]) }),
    html: Object.freeze({ query: (html, selector) => call(run, "html.query", [String(html), String(selector)]) }),
    ui: Object.freeze({ prompt: (options = {}) => call(run, "ui.prompt", [options]), review: (options) => call(run, "ui.review", [options]), notify: (text) => call(run, "ui.notify", [String(text)]) }),
    document: Object.freeze({ selection: () => call(run, "document.selection", []), insert: (text) => call(run, "document.insert", [String(text)]) }),
    plugins: Object.freeze({ call: (id, fn, args) => call(run, "plugins.call", [String(id), String(fn), args === undefined ? null : args]) }),
    commands: Object.freeze({ update: (id, patch) => call(run, "commands.update", [String(id), patch]) }),
    log: (...parts) => call(run, "log", [parts.map((part) => typeof part === "string" ? part : JSON.stringify(part)).join(" ")]),
  });
  setInterval(() => post({ type: "beat" }), 1000);
  return { post, pending, api };
})();
const exports = Object.create(null);
self.addEventListener("message", async ({ data }) => {
  if (data.type === "result") {
    const waiting = __bb.pending.get(data.id);
    if (!waiting) return;
    __bb.pending.delete(data.id);
    if (data.error !== undefined) waiting.reject(new Error(data.error)); else waiting.resolve(data.value);
    return;
  }
  if (data.type !== "run") return;
  try {
    const fn = exports[data.fn];
    if (typeof fn !== "function" && data.fn === "activate") { __bb.post({ type: "done", run: data.run, value: null }); return; }
    if (typeof fn !== "function") throw new Error("В скрипте нет функции " + data.fn);
    const value = await fn(__bb.api(data.run), data.args);
    try { __bb.post({ type: "done", run: data.run, value: value === undefined ? null : value }); }
    catch { __bb.post({ type: "done", run: data.run, error: "Функция вернула значение, которое нельзя передать" }); }
  } catch (error) {
    __bb.post({ type: "done", run: data.run, error: String(error && error.message || error) });
  }
});
for (const name of ${JSON.stringify(LOCKED)}) { try { Object.defineProperty(self, name, { value: undefined, writable: false, configurable: false }); } catch {} }
`;
const WATCHDOG_MS = 10_000, MAX_DEPTH = 4;
let runSeq = 0;

export class ScriptRuntime {
  private instances = new Map<string, Instance>();
  private memoryStorage = new Map<string, Map<string, unknown>>();
  private watchdog: ReturnType<typeof setInterval> | null = null;
  constructor(private scripts: ScriptDef[], private backend: ScriptBackend | null, private ui: ScriptUi, private commandIds: string[] = []) {}

  /** Calls exports.activate of every script (if it has one), e.g. to set command titles from saved state. */
  activateAll(onError: (owner: string, error: Error) => void) {
    const none: ScriptContext = { selection: "", insert: () => { throw new Error("activate не изменяет документ"); } };
    for (const script of this.scripts) void this.run(script.owner, "activate", null, none).catch((error: Error) => onError(script.owner, error));
  }

  /** Runs `fn` of a plugin's script with the document context of the command that started it. */
  run(owner: string, fn: string, args: unknown, context: ScriptContext, depth = 0): Promise<unknown> {
    const instance = this.instance(owner);
    const id = ++runSeq;
    return new Promise((resolve, reject) => {
      instance.runs.set(id, { resolve, reject, context, depth });
      instance.lastBeat = Date.now();
      instance.worker.postMessage({ type: "run", run: id, fn, args: args ?? null });
    });
  }

  /** Stops every worker (packages changed or the app closes). */
  dispose() {
    for (const owner of [...this.instances.keys()]) this.stop(owner, "Плагины перезагружены");
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  private instance(owner: string): Instance {
    const existing = this.instances.get(owner);
    if (existing) return existing;
    const script = this.scripts.find((item) => item.owner === owner);
    if (!script) throw new Error(`У плагина ${owner} нет работающего скрипта`);
    const url = URL.createObjectURL(new Blob([BOOTSTRAP, "\n;(function (exports) {\n", script.code, "\n})(exports);\n"], { type: "text/javascript" }));
    const worker = new Worker(url, { name: owner });
    URL.revokeObjectURL(url);
    const instance: Instance = { worker, runs: new Map(), lastBeat: Date.now(), script };
    worker.onmessage = (event) => void this.message(instance, event.data);
    worker.onerror = (event) => { event.preventDefault(); this.stop(owner, `Ошибка в скрипте: ${event.message}`); };
    this.instances.set(owner, instance);
    this.watchdog ??= setInterval(() => {
      for (const [id, item] of this.instances) if (item.runs.size && Date.now() - item.lastBeat > WATCHDOG_MS) this.stop(id, "Плагин не отвечает и был остановлен");
    }, 2000);
    return instance;
  }

  private stop(owner: string, reason: string) {
    const instance = this.instances.get(owner);
    if (!instance) return;
    instance.worker.terminate();
    this.instances.delete(owner);
    for (const run of instance.runs.values()) run.reject(new Error(reason));
  }

  private async message(instance: Instance, data: { type: string; id?: number; run?: number; method?: string; args?: unknown[]; value?: unknown; error?: string }) {
    if (data.type === "beat") { instance.lastBeat = Date.now(); return; }
    if (data.type === "done") {
      const run = instance.runs.get(data.run!);
      if (!run) return;
      instance.runs.delete(data.run!);
      if (data.error !== undefined) run.reject(new Error(data.error)); else run.resolve(data.value);
      return;
    }
    if (data.type !== "call") return;
    const run = instance.runs.get(data.run!);
    try {
      if (!run) throw new Error("Вызов вне команды плагина");
      const value = await this.call(instance.script, run, data.method ?? "", Array.isArray(data.args) ? data.args : []);
      instance.worker.postMessage({ type: "result", id: data.id, value: value === undefined ? null : value });
    } catch (error) {
      instance.worker.postMessage({ type: "result", id: data.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  private require(script: ScriptDef, permission: string) {
    if (!script.permissions.includes(permission)) throw new Error(`Нет разрешения «${permission}»`);
  }
  private requireUrl(script: ScriptDef, url: string): string {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new Error(`Неверный адрес: ${url}`); }
    if (parsed.protocol !== "https:" || parsed.port || parsed.username) throw new Error("Адрес должен быть https без порта и логина");
    const host = parsed.hostname;
    if (!networkHosts(script.permissions).some((item) => host === item || host.endsWith(`.${item}`))) throw new Error(`Нет разрешения «network:${host}»`);
    return url;
  }
  private desktop(): ScriptBackend {
    if (!this.backend) throw new Error("Доступно только в настольном приложении");
    return this.backend;
  }

  private async call(script: ScriptDef, run: Run, method: string, args: unknown[]): Promise<unknown> {
    const owner = script.owner, text = (value: unknown, max = 200_000) => typeof value === "string" ? value.slice(0, max) : "";
    const options = (value: unknown) => (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 50) : [];
    switch (method) {
      case "http.get": {
        const url = this.requireUrl(script, text(args[0], 2000)), { cookies, encoding } = options(args[1]);
        const cookieMap = cookies && typeof cookies === "object" ? Object.fromEntries(Object.entries(cookies).filter((pair): pair is [string, string] => typeof pair[1] === "string")) : undefined;
        const response = await this.desktop().httpGet(owner, url, cookieMap);
        const charset = typeof encoding === "string" ? encoding : /charset=([\w-]+)/i.exec(response.contentType)?.[1] ?? "utf-8";
        const bytes = Uint8Array.from(atob(response.body), (char) => char.charCodeAt(0));
        let decoder: TextDecoder;
        try { decoder = new TextDecoder(charset); } catch { throw new Error(`Неизвестная кодировка ${charset}`); }
        return { status: response.status, contentType: response.contentType, text: decoder.decode(bytes) };
      }
      case "window.open": {
        this.require(script, "windows");
        const { title } = options(args[1]);
        return await this.desktop().windowOpen(owner, this.requireUrl(script, text(args[0], 2000)), typeof title === "string" ? title.slice(0, 80) : undefined);
      }
      case "window.waitForCookies": {
        this.require(script, "windows");
        const { ignore, timeout } = options(args[2]);
        return await this.desktop().windowCookies(owner, text(args[0], 200), strings(args[1]), strings(ignore), typeof timeout === "number" ? timeout : undefined);
      }
      case "window.close": this.require(script, "windows"); return await this.desktop().windowClose(owner, text(args[0], 200));
      case "window.clearData": this.require(script, "windows"); return await this.desktop().windowClearData(owner);
      case "storage.get": {
        this.require(script, "storage");
        const key = text(args[0], 200);
        return this.backend ? await this.backend.storageGet(owner, key) : this.memory(owner).get(key) ?? null;
      }
      case "storage.set": {
        this.require(script, "storage");
        const key = text(args[0], 200), value = args[1] ?? null;
        if (JSON.stringify(value).length > 1024 * 1024) throw new Error("Значение больше 1 МБ");
        if (this.backend) return await this.backend.storageSet(owner, key, value);
        if (value === null) this.memory(owner).delete(key); else this.memory(owner).set(key, value);
        return null;
      }
      case "html.query": {
        const page = new DOMParser().parseFromString(text(args[0], 20_000_000), "text/html");
        let found: Element[];
        try { found = Array.from(page.querySelectorAll(text(args[1], 500))).slice(0, 500); } catch { throw new Error(`Неверный селектор: ${String(args[1])}`); }
        return found.map((element) => ({ text: element.textContent ?? "", value: element.getAttribute("value") ?? (element.tagName === "TEXTAREA" ? element.textContent ?? "" : ""), html: element.innerHTML.slice(0, 200_000), attributes: Object.fromEntries(Array.from(element.attributes).map((attribute) => [attribute.name, attribute.value])) }));
      }
      case "ui.prompt": {
        const { title, label, placeholder, hint, value } = options(args[0]);
        return await this.ui.prompt(owner, { title: text(title, 120), label: text(label, 80), placeholder: text(placeholder, 200), hint: text(hint, 500), value: text(value, 20_000) });
      }
      case "ui.review": {
        const { title, text: body, hint } = options(args[0]);
        return await this.ui.review(owner, { title: text(title, 120), text: text(body, 5_000_000), hint: text(hint, 500) });
      }
      case "ui.notify": this.ui.notify(owner, text(args[0], 500)); return null;
      case "commands.update": {
        const id = text(args[0], 128), { title, icon, hint } = options(args[1]);
        if (!this.commandIds.includes(id) || !id.startsWith(`${owner}.`)) throw new Error(`Команда ${id} не принадлежит плагину`);
        this.ui.updateCommand(owner, id, { title: typeof title === "string" ? title.slice(0, 80) : undefined, icon: typeof icon === "string" ? icon.slice(0, 120) : undefined, hint: typeof hint === "string" ? hint.slice(0, 200) : undefined });
        return null;
      }
      case "log": this.ui.notify(owner, text(args[0], 2000)); return null;
      case "document.selection": this.require(script, "document.edit"); return run.context.selection;
      case "document.insert": this.require(script, "document.edit"); run.context.insert(text(args[0], 5_000_000)); return null;
      case "plugins.call": {
        const target = text(args[0], 64), fn = text(args[1], 64);
        if (!(target in script.dependencies)) throw new Error(`Можно вызывать только плагины из dependencies: ${target}`);
        const other = this.scripts.find((item) => item.owner === target);
        if (!other) throw new Error(`Плагин ${target} не загружен`);
        if (!other.exports.includes(fn)) throw new Error(`Плагин ${target} не открывает функцию ${fn}`);
        if (run.depth >= MAX_DEPTH) throw new Error("Слишком глубокая цепочка вызовов плагинов");
        return await this.run(target, fn, args[2] ?? null, run.context, run.depth + 1);
      }
      default: throw new Error(`Неизвестный вызов bb: ${method}`);
    }
  }

  private memory(owner: string) {
    let store = this.memoryStorage.get(owner);
    if (!store) { store = new Map(); this.memoryStorage.set(owner, store); }
    return store;
  }
}
