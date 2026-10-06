/**
 * Viewport « paysage uniquement ».
 *
 * - APK : l'activité Android est verrouillée en paysage (manifeste + plugin
 *   ScreenOrientation), ce module ne fait alors presque rien.
 * - Navigateur : on tente fullscreen + screen.orientation.lock('landscape').
 *   Si l'écran reste en portrait (verrou refusé, rotation auto désactivée,
 *   jeu affiché dans une autre app…), toute l'interface est pivotée de 90° :
 *   le joueur tient son téléphone à l'horizontale et voit le jeu en paysage.
 *
 * Tout le reste du code travaille en coordonnées « logiques » paysage :
 * viewport.w > viewport.h, toujours.
 */
export interface Insets {
  l: number;
  r: number;
  t: number;
  b: number;
}

type Listener = () => void;

class Viewport {
  w = 844;
  h = 390;
  rotated = false;
  safe: Insets = { l: 0, r: 0, t: 0, b: 0 };
  private app: HTMLElement | null = null;
  private probe: HTMLElement | null = null;
  private listeners: Listener[] = [];
  private onRotateStart: Listener | null = null;

  init(app: HTMLElement, onRotatedMode?: Listener) {
    this.app = app;
    this.onRotateStart = onRotatedMode ?? null;
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
      "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
    document.body.appendChild(probe);
    this.probe = probe;
    const update = () => this.update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", () => setTimeout(update, 120));
    screen.orientation?.addEventListener?.("change", () => setTimeout(update, 120));
    window.visualViewport?.addEventListener("resize", update);
    this.update();
  }

  onChange(fn: Listener) {
    this.listeners.push(fn);
  }

  update() {
    const app = this.app;
    if (!app) return;
    const rw = window.innerWidth;
    const rh = window.innerHeight;
    const rotated = rh > rw;
    const cs = this.probe ? getComputedStyle(this.probe) : null;
    const px = (v: string | undefined) => parseFloat(v ?? "0") || 0;
    const sT = px(cs?.paddingTop), sR = px(cs?.paddingRight), sB = px(cs?.paddingBottom), sL = px(cs?.paddingLeft);
    const wasRotated = this.rotated;
    this.rotated = rotated;
    if (rotated) {
      // l'élément pivote de 90° (sens horaire) : on tient le téléphone
      // bouton/encoche vers la gauche, comme la majorité des jeux paysage
      this.w = rh;
      this.h = rw;
      app.style.width = rh + "px";
      app.style.height = rw + "px";
      app.style.transformOrigin = "0 0";
      app.style.transform = "rotate(90deg) translateY(-100%)";
      // bords logiques ← bords physiques
      this.safe = { l: sT, r: sB, t: sR, b: sL };
    } else {
      this.w = rw;
      this.h = rh;
      app.style.width = "";
      app.style.height = "";
      app.style.transform = "";
      this.safe = { l: sL, r: sR, t: sT, b: sB };
    }
    app.classList.toggle("rotated", rotated);
    const st = app.style;
    st.setProperty("--sl", this.safe.l + "px");
    st.setProperty("--sr", this.safe.r + "px");
    st.setProperty("--st", this.safe.t + "px");
    st.setProperty("--sb", this.safe.b + "px");
    if (rotated && !wasRotated) this.onRotateStart?.();
    for (const fn of this.listeners) fn();
  }

  /** Coordonnées écran (clientX/Y) → coordonnées logiques paysage. */
  toLocal(clientX: number, clientY: number): { x: number; y: number } {
    if (this.rotated) return { x: clientY, y: window.innerWidth - clientX };
    return { x: clientX, y: clientY };
  }

  /** Plein écran + verrouillage paysage quand la plateforme le permet. */
  async lockLandscape() {
    // appli Android : l'orientation et le plein écran sont gérés nativement
    if ((window as unknown as { BombeRushAndroid?: unknown }).BombeRushAndroid) return;
    const cap = (window as unknown as {
      Capacitor?: { Plugins?: { ScreenOrientation?: { lock(o: { orientation: string }): Promise<void> } } };
    }).Capacitor?.Plugins?.ScreenOrientation;
    try {
      if (cap) {
        await cap.lock({ orientation: "landscape" });
        return;
      }
    } catch {
      /* plugin absent */
    }
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    } catch {
      /* plein écran refusé (iframe, iOS…) : la rotation CSS prend le relais */
    }
    try {
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await o.lock?.("landscape");
    } catch {
      /* verrou refusé : rotation CSS */
    }
    this.update();
  }
}

export const viewport = new Viewport();
