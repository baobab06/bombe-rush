/**
 * ACHATS INTÉGRÉS (argent réel) — interface unique entre le jeu et le magasin.
 *
 * Fournisseurs :
 *  - none    : pas de paiement (jeu web, ancienne appli) → les packs affichent
 *              « disponible dans l'appli Android » ;
 *  - android : pont vers Google Play Billing de l'appli (window.BombeRushBilling,
 *              voir android-gradle/…/BillingBridge.java) ;
 *  - test    : faux magasin CLAIREMENT signalé « ACHAT DE TEST », uniquement en
 *              local (localhost) avec ?billing=test — jamais en production.
 *
 * Le jeu ne crédite un pack que lorsque Google Play confirme l'achat
 * (statut "purchased" + jeton). Chaque jeton n'est crédité qu'une fois
 * (meta/bank.ts), puis l'achat est « consommé » pour pouvoir être racheté.
 */
import { PACKS } from "../meta/economy";

export type BuyStatus = "purchased" | "pending" | "cancelled" | "unavailable" | "error";
export interface BuyResult {
  status: BuyStatus;
  productId?: string;
  token?: string;
}
export interface StoreProduct {
  id: string;
  /** prix affiché par Google Play, dans la devise du joueur */
  price: string;
}

/** Pont natif attendu dans l'application Android. */
interface NativeBilling {
  isReady(): boolean;
  queryProducts(idsCsv: string, callbackId: string): void;
  buy(productId: string, callbackId: string): void;
  consume(token: string): void;
  restore(): void;
}

interface BillingProvider {
  readonly name: "none" | "android" | "test";
  products(): Promise<StoreProduct[]>;
  buy(productId: string): Promise<BuyResult>;
  consume(token: string): void;
  restore(): void;
}

type Win = Window & {
  BombeRushBilling?: NativeBilling;
  __bombeRushBillingResult?: (id: string, json: string) => void;
  __bombeRushPurchase?: (json: string) => void;
};
const win = window as Win;

/** Achats signalés hors d'un clic « acheter » (achat en attente validé plus tard, appli relancée…). */
let onLatePurchase: (productId: string, token: string) => void = () => {};

const noneProvider: BillingProvider = {
  name: "none",
  products: async () => [],
  buy: async () => ({ status: "unavailable" }),
  consume: () => {},
  restore: () => {},
};

function androidProvider(native: NativeBilling): BillingProvider {
  const waiting = new Map<string, (json: string) => void>();
  win.__bombeRushBillingResult = (id, json) => {
    waiting.get(id)?.(json);
    waiting.delete(id);
  };
  win.__bombeRushPurchase = (json) => {
    try {
      const r = JSON.parse(json) as { productId?: string; token?: string };
      if (r.productId && r.token) onLatePurchase(r.productId, r.token);
    } catch {
      /* message illisible */
    }
  };
  let n = 0;
  const call = (fn: (cb: string) => void, timeoutMs: number) =>
    new Promise<string | null>((resolve) => {
      const id = `bill${++n}`;
      const to = window.setTimeout(() => {
        waiting.delete(id);
        resolve(null);
      }, timeoutMs);
      waiting.set(id, (json) => {
        window.clearTimeout(to);
        resolve(json);
      });
      try {
        fn(id);
      } catch {
        window.clearTimeout(to);
        waiting.delete(id);
        resolve(null);
      }
    });
  const parse = <T>(json: string | null): T | null => {
    try {
      return json ? (JSON.parse(json) as T) : null;
    } catch {
      return null;
    }
  };
  return {
    name: "android",
    async products() {
      const r = parse<{ products?: StoreProduct[] }>(await call((id) => native.queryProducts(PACKS.map((x) => x.id).join(","), id), 15000));
      return r?.products ?? [];
    },
    async buy(productId) {
      if (!native.isReady()) return { status: "unavailable" };
      // le joueur peut rester longtemps sur l'écran de paiement de Google
      const r = parse<BuyResult>(await call((id) => native.buy(productId, id), 15 * 60000));
      return r ?? { status: "error" };
    },
    consume: (token) => {
      try {
        native.consume(token);
      } catch {
        /* pont absent */
      }
    },
    restore: () => {
      try {
        native.restore();
      } catch {
        /* pont absent */
      }
    },
  };
}

function testProvider(): BillingProvider {
  let k = 0;
  return {
    name: "test",
    products: async () => PACKS.map((x) => ({ id: x.id, price: `${x.price} (test)` })),
    buy: (productId) =>
      new Promise((resolve) => {
        const el = document.createElement("div");
        el.className = "ad-test";
        el.innerHTML = `<div><b>ACHAT DE TEST</b><p>${productId}<br><small>Simulation locale (localhost) — aucun paiement réel.</small></p>
          <button class="btn btn-green small" data-ok><span>Payer (test)</span></button> <button class="btn btn-ghost small" data-no><span>Annuler</span></button></div>`;
        document.getElementById("app")!.appendChild(el);
        el.querySelector("[data-ok]")!.addEventListener("click", () => {
          el.remove();
          resolve({ status: "purchased", productId, token: `test-${Date.now()}-${++k}` });
        });
        el.querySelector("[data-no]")!.addEventListener("click", () => {
          el.remove();
          resolve({ status: "cancelled", productId });
        });
      }),
    consume: () => {},
    restore: () => {},
  };
}

function pick(): BillingProvider {
  if (win.BombeRushBilling) return androidProvider(win.BombeRushBilling);
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (local && new URLSearchParams(location.search).get("billing") === "test") return testProvider();
  return noneProvider;
}

class BillingService {
  readonly provider = pick();
  private busy = false;
  private cache: StoreProduct[] | null = null;

  /** Les achats en argent réel sont possibles ici (appli Android). */
  get enabled(): boolean {
    return this.provider.name !== "none";
  }

  /** Prix réels (Google Play) ; vide si le magasin ne répond pas. */
  async products(): Promise<StoreProduct[]> {
    if (this.cache?.length) return this.cache;
    try {
      this.cache = await this.provider.products();
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  async buy(productId: string): Promise<BuyResult> {
    if (this.busy) return { status: "unavailable" };
    this.busy = true;
    try {
      return await this.provider.buy(productId);
    } catch {
      return { status: "error" };
    } finally {
      this.busy = false;
    }
  }

  /** À appeler APRÈS avoir crédité (et sauvegardé) le pack. */
  consume(token: string) {
    this.provider.consume(token);
  }

  /** Branche le crédit des achats arrivés hors clic, puis demande ceux en souffrance. */
  listen(handler: (productId: string, token: string) => void) {
    onLatePurchase = handler;
    this.provider.restore();
  }
}

export const billing = new BillingService();
