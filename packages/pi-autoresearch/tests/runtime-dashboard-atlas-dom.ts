/** Minimal deterministic DOM seam, not a browser/layout/CSP implementation. */
import { runInNewContext } from "node:vm";
import { DASHBOARD_ATLAS_SCRIPT } from "../src/core/runtime-dashboard-atlas-script.ts";
import { DASHBOARD_PERFORMANCE_SCRIPT } from "../src/core/runtime-dashboard-performance-script.ts";
import { DASHBOARD_REFRESH_SCRIPT } from "../src/core/runtime-dashboard-refresh.ts";

function decode(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}
class Element {
  children: Element[] = [];
  parent: Element | null = null;
  attrs = new Map<string, string>();
  listeners = new Map<string, ((e: { target: Element }) => void)[]>();
  ownText = "";
  value = "";
  checked = false;
  open = false;
  scrollTop = 0;
  scrollLeft = 0;
  constructor(
    public tag: string,
    public doc?: Element,
  ) {}
  get id() {
    return this.attrs.get("id") ?? "";
  }
  get dataset(): Record<string, string> {
    return Object.fromEntries(
      [...this.attrs]
        .filter(([k]) => k.startsWith("data-"))
        .map(([k, v]) => [k.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), v]),
    );
  }
  get hidden() {
    return this.attrs.has("hidden");
  }
  set hidden(v: boolean) {
    if (v) this.attrs.set("hidden", "");
    else this.attrs.delete("hidden");
  }
  get disabled() {
    return this.attrs.has("disabled");
  }
  set disabled(v: boolean) {
    if (v) this.attrs.set("disabled", "");
    else this.attrs.delete("disabled");
  }
  get textContent(): string {
    return this.ownText + this.children.map((c) => c.textContent).join("");
  }
  set textContent(v: string) {
    this.ownText = v;
    this.children = [];
  }
  set className(v: string) {
    this.attrs.set("class", v);
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  hasAttribute(k: string) {
    return this.attrs.has(k);
  }
  append(...items: Element[]) {
    for (const el of items) {
      el.parent = this;
      this.children.push(el);
    }
  }
  replaceChildren(...items: Element[]) {
    this.children = [];
    this.ownText = "";
    this.append(...items);
  }
  matches(selector: string): boolean {
    if (selector.startsWith("[")) return this.attrs.has(selector.slice(1, -1));
    if (selector.startsWith("."))
      return (this.attrs.get("class") ?? "").split(" ").includes(selector.slice(1));
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    return this.tag === selector;
  }
  querySelectorAll(selector: string): Element[] {
    const [first, ...rest] = selector.split(" ");
    const descendants = this.children.flatMap((c): Element[] => [c, ...c.querySelectorAll("*")]);
    const matches = descendants.filter((c) => first === "*" || c.matches(first));
    return rest.length ? matches.flatMap((c) => c.querySelectorAll(rest.join(" "))) : matches;
  }
  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  closest(selector: string): Element | null {
    return this.matches(selector) ? this : (this.parent?.closest(selector) ?? null);
  }
  contains(other: Element): boolean {
    return this === other || this.children.some((c) => c.contains(other));
  }
  addEventListener(name: string, fn: (e: { target: Element }) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn]);
  }
  emit(name: string, target = this) {
    for (const fn of this.listeners.get(name) ?? [])
      fn({ target, preventDefault: () => {} } as { target: Element });
  }
  dispatchEvent(event: { type: string }) {
    this.emit(event.type);
    return true;
  }
  activeElement: Element | null = null;
  focus() {
    if (this.doc) this.doc.activeElement = this;
  }
}
function parse(html: string): Element {
  const document = new Element("document");
  const stack = [document];
  // Script/style execution is separate, using the exact source constants.
  const source = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, "");
  for (const token of source.match(/<[^>]+>|[^<]+/g) ?? []) {
    if (token.startsWith("<!")) continue;
    if (token.startsWith("</")) {
      stack.pop();
      continue;
    }
    if (token.startsWith("<")) {
      const tag = token.match(/^<([\w-]+)/)?.[1];
      if (!tag) continue;
      const el = new Element(tag, document);
      const attrs = token.slice(tag.length + 1, -1);
      for (const m of attrs.matchAll(/([\w:-]+)(?:="([^"]*)")?/g))
        el.attrs.set(m[1], decode(m[2] ?? ""));
      el.value = el.attrs.get("value") ?? "";
      stack.at(-1)?.append(el);
      if (!token.endsWith("/>") && !["input", "meta", "br", "hr", "link"].includes(tag))
        stack.push(el);
    } else {
      const el = new Element("text", document);
      el.ownText = decode(token);
      stack.at(-1)?.append(el);
    }
  }
  return document;
}
export function atlasBrowser(
  html: string,
  storage = new Map<string, string>(),
  denied = false,
  rejectWrite: (key: string, value: string) => boolean = () => false,
) {
  const document = parse(html);
  const window = new Element("window");
  let tick: (() => void) | undefined;
  let reloads = 0;
  const location = {
    pathname: "/synthetic-atlas.html",
    hash: "",
    reload: () => {
      reloads++;
    },
  };
  const byId = (id: string) => {
    const el = document.querySelector(`#${id}`);
    if (!el) throw new Error(`Missing fixture element ${id}`);
    return el;
  };
  Object.assign(document, {
    getElementById: (id: string) => document.querySelector(`#${id}`),
    createElement: (tag: string) => new Element(tag, document),
  });
  byId("atlas-filter").value = "all";
  const context = {
    document,
    window,
    location,
    Event: class {
      constructor(public type: string) {}
    },
    sessionStorage: {
      getItem: (k: string) => {
        if (denied) throw Error("blocked");
        return storage.get(k) ?? null;
      },
      setItem: (k: string, v: string) => {
        if (denied || rejectWrite(k, v)) throw Error("blocked");
        storage.set(k, v);
      },
    },
    scrollY: 0,
    scrollTo: () => {},
    getSelection: () => "",
    requestAnimationFrame: (fn: () => void) => fn(),
    setTimeout: (fn: () => void) => {
      tick = fn;
      return 1;
    },
    clearTimeout: () => {
      tick = undefined;
    },
  };
  runInNewContext(DASHBOARD_ATLAS_SCRIPT, context);
  runInNewContext(DASHBOARD_PERFORMANCE_SCRIPT, context);
  runInNewContext(DASHBOARD_REFRESH_SCRIPT, context);
  return {
    document,
    window,
    location,
    byId,
    storage,
    tick: () => tick?.(),
    reloads: () => reloads,
    input: (id: string, value: string) => {
      const el = byId(id);
      el.value = value;
      document.emit("input", el);
      el.emit("input");
    },
    click: (el: Element) => {
      document.emit("pointerdown", el);
      el.emit("click");
    },
    pick: (index: number) => {
      const el = document.querySelectorAll("[data-stack-pick]")[index];
      el.checked = !el.checked;
      document.emit("input", el);
      el.emit("change");
    },
  };
}
