/**
 * Langues du jeu.
 *
 * Le jeu est écrit en français. Pour les autres langues, les textes sont traduits au moment
 * de l'affichage : dans la page (nœuds texte et attributs lisibles, suivis par un
 * MutationObserver) et dans les canvas (fillText / strokeText / measureText).
 * Le dictionnaire (dict.gen.json) est indexé par le texte français ; un gabarit
 * « Il te manque {0} pièces » couvre toutes les valeurs. Sans traduction : le français reste.
 *
 * Données : src/i18n/lang/<langue>.tsv → `bun scripts/i18n-build.ts` → dict.gen.json
 */
import DICT from "./dict.gen.json";
import { getLang, setCurrentLang, type Lang } from "./locale";

export { getLang, locale, type Lang } from "./locale";
export const LANGS: { id: Lang; name: string; flag: string }[] = [
  { id: "fr", name: "Français", flag: "🇫🇷" },
  { id: "en", name: "English", flag: "🇬🇧" },
  { id: "es", name: "Español", flag: "🇪🇸" },
  { id: "de", name: "Deutsch", flag: "🇩🇪" },
  { id: "it", name: "Italiano", flag: "🇮🇹" },
  { id: "pt", name: "Português", flag: "🇧🇷" },
];
/** pays dont la langue n'est pas proposée → langue la plus parlée sur place */
const REGION: Record<string, Lang> = {
  FR: "fr", BE: "fr", LU: "fr", MC: "fr", CH: "fr", MA: "fr", DZ: "fr", TN: "fr", SN: "fr", CI: "fr", CM: "fr", ML: "fr", BF: "fr", NE: "fr",
  GN: "fr", BJ: "fr", TG: "fr", CD: "fr", CG: "fr", GA: "fr", MG: "fr", HT: "fr", RE: "fr", GP: "fr", MQ: "fr", GF: "fr", NC: "fr", PF: "fr",
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es", EC: "es", GT: "es", CU: "es", BO: "es", DO: "es", HN: "es", PY: "es",
  SV: "es", NI: "es", CR: "es", PA: "es", UY: "es", PR: "es", DE: "de", AT: "de", LI: "de", IT: "it", SM: "it", VA: "it",
  BR: "pt", PT: "pt", AO: "pt", MZ: "pt", CV: "pt",
};
const STORE = "bomberush.lang";
const isLang = (s: unknown): s is Lang => LANGS.some((l) => l.id === s);

/** langue choisie dans les Paramètres, sinon celle du téléphone (puis son pays), sinon l'anglais */
export function detectLang(): Lang {
  try {
    const s = localStorage.getItem(STORE);
    if (isLang(s)) return s;
  } catch { /* stockage indisponible */ }
  const list = navigator.languages?.length ? navigator.languages : [navigator.language || "fr-FR"];
  for (const l of list) { const b = (l || "").slice(0, 2).toLowerCase(); if (isLang(b)) return b; }
  for (const l of list) { const r = /[-_]([A-Za-z]{2})\b/.exec(l || "")?.[1]?.toUpperCase(); if (r && REGION[r]) return REGION[r]; }
  return "en";
}


/** change de langue (le jeu redémarre pour tout réafficher) */
export function setLang(l: Lang) {
  try { localStorage.setItem(STORE, l); } catch { /* tant pis : la langue du téléphone reste */ }
  location.reload();
}

// ------------------------------------------------------------------ dictionnaire
type Pat = { re: RegExp; lit: string; out: string; n: number; rich: boolean };
let exact: Map<string, string> | null = null;
const upper = new Map<string, string>();
const lower = new Map<string, string>();
const outs = new Set<string>();
let pats: Pat[] = [];
const cache = new Map<string, string | null>();
const made = new Set<string>();

const N = (s: string) => s.replace(/[\s\u00a0\u202f]+/g, " ").trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LETTER = /[A-Za-zÀ-ÿŒœ]/;

function load(l: Lang) {
  const d = DICT as unknown as Record<string, string[]>;
  const keys = d.keys ?? [], vals = d[l] ?? [];
  exact = new Map();
  pats = [];
  upper.clear(); lower.clear(); outs.clear(); cache.clear(); made.clear();
  keys.forEach((k, i) => {
    const v = vals[i];
    if (!v) return;
    outs.add(v);
    if (/\{\d+\}/.test(k)) {
      const parts = k.split(/\{\d+\}/);
      const lit = parts.reduce((a, b) => (b.trim().length > a.length ? b.trim() : a), "");
      pats.push({ re: new RegExp("^" + parts.map(esc).join("([\\s\\S]*?)") + "$"), lit, out: v, n: parts.join("").length, rich: k.includes("</") });
    } else exact!.set(k, v);
  });
  for (const [k, v] of exact) {
    const u = k.toUpperCase(), l = k.toLowerCase();
    if (u !== k && !exact.has(u)) upper.set(u, v.toUpperCase());
    if (l !== k && !exact.has(l) && !lower.has(l)) lower.set(l, v);
  }
  pats.sort((a, b) => b.n - a.n);
}

/** {0} → valeur ; {0|un|plusieurs} → singulier ou pluriel selon le nombre {0} (ou selon le « s » français qu'il contient) */
function fill(out: string, caps: string[]): string {
  return out.replace(/\{(\d+)(?:\|([^|}]*)\|([^}]*))?\}/g, (_, i: string, one?: string, many?: string) => {
    const c = caps[+i] ?? "";
    if (one === undefined) return c;
    // marque du pluriel française (« victoire{0} » : "" ou "s")
    if (c === "") return one;
    if (c === "s" || c === "x") return many!;
    const n = parseFloat(c.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
    return n === 1 || n === -1 ? one : many!;
  });
}

/** le nom du jeu ne se traduit jamais */
const NEVER = new Set(["BOMBE", "RUSH", "BOMBE RUSH", "Bombe Rush", "Bombe", "Rush"]);

function look(s: string, d: number): string | null {
  if (!LETTER.test(s) || (NEVER.has(s) && d === 0)) return null;
  const e = exact!.get(s);
  if (e !== undefined) return e;
  if (outs.has(s)) return null; // déjà traduit
  for (const p of pats) {
    if (p.lit && !s.includes(p.lit)) continue;
    const m = p.re.exec(s);
    if (!m) continue;
    // les morceaux variables peuvent être des textes du jeu eux aussi (nom d'une mission…)
    return fill(p.out, m.slice(1).map((c) => (d < 2 ? look(c.trim(), d + 1) ?? c : c)));
  }
  const u = upper.get(s);
  if (u !== undefined) return u;
  // en minuscules (« épique », « classement mondial »)
  if (s === s.toLowerCase()) {
    const w = lower.get(s);
    if (w !== undefined) return w.charAt(0).toLowerCase() + w.slice(1);
  }
  if (d >= 3) return null;
  // emoji, ponctuation ou chiffres autour d'un texte connu : « 🎮 Classique », « Victoire ! »
  const a = /^([^\p{L}]*?)(\p{L}[\s\S]*?\p{L}|\p{L})([^\p{L}]*)$/u.exec(s);
  if (a && (a[1] || a[3])) {
    const c = look(a[2], d + 1);
    if (c != null) return a[1] + c + a[3].replace(/^[   ]+(?=[!?:;])/, "");
  }
  // divisions de rang : « Argent II »
  const r = /^(.*\p{L}) (I|II|III|IV|V)$/u.exec(s);
  if (r) { const c = look(r[1], d + 1); if (c != null) return c + " " + r[2]; }
  // morceaux séparés : « 🎉 Personnage : Piquant », « Niveau 3 · 12 parties »
  for (const sep of [" : ", " · ", " — ", " – ", " / "]) {
    if (!s.includes(sep)) continue;
    let any = false;
    const parts = s.split(sep).map((x) => { const c = look(x, d + 1); if (c != null) any = true; return c ?? x; });
    if (any) return parts.join(sep === " : " ? ": " : sep);
  }
  // étiquette + nom : « Titre Roi de l'hiver », « Traînée Givre »
  const f = /^(\p{L}+) (.+)$/u.exec(s);
  if (f) {
    const w = exact!.get(f[1]);
    if (w !== undefined) return w + " " + (look(f[2], d + 1) ?? f[2]);
  }
  return null;
}

/** phrase mise en forme (« Pose ton <b>pouce</b>… ») : clé exacte ou gabarit, sans autre secours */
function lookRich(s: string): string | null {
  const e = exact!.get(s);
  if (e !== undefined) return e;
  for (const p of pats) {
    if (p.lit && !s.includes(p.lit)) continue; // (un gabarit sans balise convient aussi : ses trous peuvent en contenir)
    const m = p.re.exec(s);
    // morceau variable : texte du jeu, ou phrase mise en forme elle aussi (« Saison précédente : <b>…</b> »)
    if (m) return fill(p.out, m.slice(1).map((c) => {
      const w = c.trim();
      if (!w) return c;
      const x = /</.test(w) ? lookRich(w) : look(w, 1);
      return x == null ? c : c.replace(w, () => x);
    }));
  }
  return null;
}

/** traduction d'un texte affiché, ou null si on n'en a pas */
export function tr(raw: string): string | null {
  if (!exact || !raw || !LETTER.test(raw)) return null;
  let r = cache.get(raw);
  if (r !== undefined) return r;
  const n = N(raw);
  // un texte que l'on vient de produire ne se retraduit pas
  const v = made.has(n) ? null : look(n, 0);
  r = v == null ? null : /^\s*/.exec(raw)![0] + v + /\s*$/.exec(raw)![0];
  if (cache.size > 6000) { cache.clear(); made.clear(); }
  cache.set(raw, r);
  if (v != null) made.add(N(v));
  return r;
}
/** texte traduit (ou tel quel) : pour ce qui ne passe ni par la page ni par un canvas (partage, notifications) */
export const t = (s: string) => tr(s) ?? s;
/** comme t(), ligne par ligne (messages à partager) */
export const tLines = (s: string) => (getLang() === "fr" ? s : s.split("\n").map(t).join("\n"));

/** charge une langue sans toucher à la page (tests) */
export function loadLang(l: Lang) {
  setCurrentLang(l);
  if (l === "fr") { exact = null; return; }
  load(l);
}

// ------------------------------------------------------------------ page
const ATTRS = ["placeholder", "title", "aria-label", "alt"];
const SKIP_SEL = "script,style,textarea,noscript,[data-no-i18n],[contenteditable=''],[contenteditable='true']";
const SKIP_TAG = new Set(["SCRIPT", "STYLE", "TEXTAREA", "NOSCRIPT", "INPUT"]);
const doneText = new WeakMap<Text, string>();

function onText(n: Text) {
  const d = n.data;
  if (doneText.get(n) === d) return;
  // dans une phrase déjà traduite d'un bloc : on n'y touche plus
  const p = n.parentElement;
  if (p && (doneRich.has(p) || (p.parentElement && doneRich.has(p.parentElement)))) { doneText.set(n, d); return; }
  // data-tr="…" : le texte de l'élément se traduit avec cette clé (« LANCER » d'une partie ≠ « LANCER » une bombe)
  const alt = p?.getAttribute("data-tr");
  const v = alt && d.trim() ? (tr(alt) == null ? null : d.replace(d.trim(), () => tr(alt)!)) : tr(d);
  if (v != null && v !== d) { n.data = v; doneText.set(n, v); } else doneText.set(n, d);
}
const doneAttr = new WeakMap<Element, Record<string, string>>();
function onAttrs(e: Element) {
  for (const a of ATTRS) {
    const v = e.getAttribute(a);
    if (!v) continue;
    let d = doneAttr.get(e);
    if (d?.[a] === v) continue;
    const w = tr(v);
    if (!d) doneAttr.set(e, (d = {}));
    if (w != null && w !== v) { d[a] = w; e.setAttribute(a, w); } else d[a] = v;
  }
}
// phrases mises en forme : un élément qui ne contient que du texte et des balises de mise en forme
// (elles-mêmes ne contenant que du texte) se traduit d'un bloc ; ses balises sont réutilisées,
// dans l'ordre de la traduction (« Il te manque <b>12</b> pièces » → « You need <b>12</b> coins »)
const INLINE = new Set(["b", "strong", "i", "em", "u", "small", "span", "kbd"]);
const doneRich = new WeakMap<Element, string>();
function richOf(e: Element): string | null {
  let out = "", inl = 0, txt = false;
  for (const n of Array.from(e.childNodes)) {
    if (n.nodeType === 3) { const d = (n as Text).data; if (/[A-Za-zÀ-ÿ]{2}/.test(d)) txt = true; out += d; }
    else if (n.nodeType === 1) {
      const c = n as Element, tag = c.tagName.toLowerCase();
      if (!INLINE.has(tag)) return null;
      for (const g of Array.from(c.childNodes)) if (g.nodeType !== 3) return null;
      inl++;
      out += `<${tag}>${c.textContent}</${tag}>`;
    }
  }
  return inl && txt ? N(out) : null;
}
/** true si l'élément est traité (traduit maintenant ou avant) : ses enfants n'ont plus à l'être */
function onRich(e: Element): boolean {
  const s = richOf(e);
  if (s == null) { doneRich.delete(e); return false; }
  if (doneRich.get(e) === s) return true;
  const v = made.has(s) ? null : lookRich(s);
  if (v == null || v === s) { if (!made.has(s)) doneRich.delete(e); return made.has(s); }
  const segs = [...v.matchAll(/<(\w+)>([^<]*)<\/\1>|([^<]+)/g)];
  const pool = new Map<string, Element[]>();
  for (const c of Array.from(e.children)) { const t = c.tagName.toLowerCase(); if (!pool.has(t)) pool.set(t, []); pool.get(t)!.push(c); }
  const need = new Map<string, number>();
  for (const m of segs) if (m[1]) need.set(m[1], (need.get(m[1]) ?? 0) + 1);
  if (need.size !== pool.size || [...need].some(([t, n]) => pool.get(t)?.length !== n)) { doneRich.delete(e); return false; } // balises différentes
  const kids: Node[] = [];
  for (const m of segs) {
    if (m[1]) {
      const c = pool.get(m[1])!.shift()!;
      if (c.textContent !== m[2]) c.textContent = m[2];
      if (c.firstChild) doneText.set(c.firstChild as Text, m[2]);
      kids.push(c);
    } else { const tn = document.createTextNode(m[3]); doneText.set(tn, m[3]); kids.push(tn); }
  }
  e.replaceChildren(...kids);
  made.add(N(v));
  doneRich.set(e, richOf(e) ?? "");
  return true;
}

// éléments dont on ne traduit pas le contenu (les attributs d'un champ de saisie, si : placeholder…)
const skipEl = (e: Element) => SKIP_TAG.has(e.tagName) || e.hasAttribute("data-no-i18n") || (e as HTMLElement).isContentEditable;

function walk(root: Node) {
  if (root.nodeType === 3) return onText(root as Text);
  if (root.nodeType !== 1 && root.nodeType !== 11) return;
  if (root.nodeType === 1) {
    const e = root as Element;
    if (e.hasAttribute("data-no-i18n")) return;
    onAttrs(e);
    if (skipEl(e) || onRich(e)) return;
  }
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      if (n.nodeType !== 1) return NodeFilter.FILTER_ACCEPT;
      const e = n as Element;
      if (e.hasAttribute("data-no-i18n")) return NodeFilter.FILTER_REJECT;
      if (skipEl(e)) { onAttrs(e); return NodeFilter.FILTER_REJECT; }
      if (onRich(e)) { onAttrs(e); return NodeFilter.FILTER_REJECT; }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = tw.nextNode(); n; n = tw.nextNode()) n.nodeType === 3 ? onText(n as Text) : onAttrs(n as Element);
}

/** un changement dans l'élément (ou dans une de ses balises de mise en forme) : la phrase entière se retraduit */
function richUp(p: Element): boolean {
  if (onRich(p)) return true;
  const q = p.parentElement;
  return !!q && INLINE.has(p.tagName.toLowerCase()) && onRich(q);
}

function watch() {
  const inSkip = (n: Node) => !!n.parentElement?.closest(SKIP_SEL);
  new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.type === "characterData") {
        if (inSkip(r.target)) continue;
        const p = r.target.parentElement;
        if (p && richUp(p)) continue;
        onText(r.target as Text);
      }
      else if (r.type === "attributes") { if (!(r.target as Element).closest("[data-no-i18n]")) onAttrs(r.target as Element); }
      else {
        const p = r.target as Element;
        if (p.nodeType === 1 && p.isConnected && !p.closest(SKIP_SEL) && richUp(p)) continue;
        r.addedNodes.forEach((n) => { if (n.isConnected && !inSkip(n)) walk(n); });
      }
    }
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

// ------------------------------------------------------------------ canvas
function patchCanvas(proto: Record<string, unknown> | undefined) {
  if (!proto) return;
  for (const f of ["fillText", "strokeText", "measureText"]) {
    const o = proto[f] as ((s: unknown, ...a: unknown[]) => unknown) | undefined;
    if (typeof o !== "function") continue;
    proto[f] = function (this: unknown, s: unknown, ...a: unknown[]) {
      return o.call(this, typeof s === "string" ? tr(s) ?? s : s, ...a);
    };
  }
}

// ------------------------------------------------------------------ démarrage (dès l'import)
function init() {
  if (typeof document === "undefined") return;
  const lang = detectLang();
  setCurrentLang(lang);
  document.documentElement.lang = lang;
  if (lang === "fr") return;
  load(lang);
  patchCanvas(globalThis.CanvasRenderingContext2D?.prototype as unknown as Record<string, unknown>);
  patchCanvas((globalThis as unknown as { OffscreenCanvasRenderingContext2D?: { prototype: Record<string, unknown> } }).OffscreenCanvasRenderingContext2D?.prototype);
  walk(document.documentElement);
  watch();
}
init();
