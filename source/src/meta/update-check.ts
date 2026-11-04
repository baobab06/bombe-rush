/**
 * Vérification des mises à jour (côté jeu).
 *
 *  - au lancement, puis au retour dans l'appli si la dernière vérification
 *    date de plus de 30 minutes (jamais en boucle) ;
 *  - la réponse du serveur est gardée sur l'appareil : sans réseau, une mise
 *    à jour obligatoire déjà connue reste obligatoire (pas de contournement
 *    en coupant Internet), mais un joueur à jour n'est jamais bloqué.
 */
import { DEFAULT_UPDATE, sanitizeUpdate, updateStatus, type UpdateConfig, type UpdateStatus } from "../net/update-policy";

const CACHE_KEY = "bomberush.update";
export const RECHECK_MS = 30 * 60_000;
const TIMEOUT_MS = 8000;

export interface UpdateResult {
  status: UpdateStatus;
  config: UpdateConfig;
  /** d'où vient la décision */
  source: "server" | "cache" | "none";
  current: string;
}

interface Cached {
  config: UpdateConfig;
  at: number;
}

export interface CheckDeps {
  base: () => string | null;
  version: () => string;
  fetch?: typeof fetch;
  storage?: Pick<Storage, "getItem" | "setItem">;
  now?: () => number;
}

export class UpdateChecker {
  last: UpdateResult | null = null;
  lastCheckAt = 0;
  private inflight: Promise<UpdateResult> | null = null;

  constructor(private d: CheckDeps) {}

  private store(): Pick<Storage, "getItem" | "setItem"> | null {
    try {
      return this.d.storage ?? localStorage;
    } catch {
      return null;
    }
  }

  readCache(): Cached | null {
    try {
      const raw = this.store()?.getItem(CACHE_KEY);
      if (!raw) return null;
      const c = JSON.parse(raw) as Cached;
      const s = sanitizeUpdate(c.config, c.config?.updatedAt ?? 0);
      return s.ok ? { config: { ...s.config, updatedAt: c.config.updatedAt ?? 0 }, at: c.at ?? 0 } : null;
    } catch {
      return null;
    }
  }

  private writeCache(config: UpdateConfig) {
    try {
      this.store()?.setItem(CACHE_KEY, JSON.stringify({ config, at: this.now() }));
    } catch {
      /* stockage plein ou bloqué : tant pis */
    }
  }

  private now() {
    return (this.d.now ?? Date.now)();
  }

  /** Décision immédiate à partir de la dernière réponse gardée (avant même d'avoir le réseau). */
  fromCache(): UpdateResult {
    const current = this.d.version();
    const c = this.readCache();
    if (!c) return { status: "ok", config: { ...DEFAULT_UPDATE }, source: "none", current };
    return { status: updateStatus(c.config, current), config: c.config, source: "cache", current };
  }

  /** Demande la configuration au serveur (une seule requête à la fois). */
  check(): Promise<UpdateResult> {
    this.inflight ??= this.run().finally(() => (this.inflight = null));
    return this.inflight;
  }

  /** Revérifier au retour dans l'appli ? */
  due(): boolean {
    return this.now() - this.lastCheckAt > RECHECK_MS;
  }

  private async run(): Promise<UpdateResult> {
    const current = this.d.version();
    const base = this.d.base();
    this.lastCheckAt = this.now();
    if (!base) return (this.last = this.fromCache());
    const f = this.d.fetch ?? fetch.bind(globalThis);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await f(`${base.replace(/\/$/, "")}/api/update?v=${encodeURIComponent(current)}`, { cache: "no-store", signal: ctrl.signal });
      if (r.status !== 200) throw new Error("serveur " + r.status);
      const j = (await r.json()) as { config?: unknown };
      const s = sanitizeUpdate(j.config, 0);
      if (!s.ok) throw new Error("réponse invalide");
      const config = { ...s.config, updatedAt: (j.config as UpdateConfig).updatedAt ?? 0 };
      this.writeCache(config);
      return (this.last = { status: updateStatus(config, current), config, source: "server", current });
    } catch {
      // hors ligne ou serveur indisponible : dernière configuration connue
      return (this.last = this.fromCache());
    } finally {
      clearTimeout(t);
    }
  }
}
