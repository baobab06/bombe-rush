/**
 * CONNEXION GOOGLE (officielle) : obtient un jeton d'identité signé par Google.
 * Le jeu ne lit jamais l'identifiant Google lui-même : le jeton est envoyé au
 * serveur, qui le vérifie (server/accounts.ts).
 *
 *  - appli Android : Credential Manager + « Se connecter avec Google »
 *    (pont natif window.BombeRushAuth, voir android-gradle/…/AuthBridge.java) ;
 *  - navigateur : bouton officiel Google Identity Services ;
 *  - tests : jeton fourni par le banc d'essai, seulement en local avec ?auth=test.
 */

interface NativeAuth {
  signIn(serverClientId: string, callbackId: string): void;
  signOut(): void;
}

type Win = Window & {
  BombeRushAuth?: NativeAuth;
  __bombeRushAuthResult?: (id: string, json: string) => void;
  __bombeRushTestToken?: string;
  google?: {
    accounts: {
      id: {
        initialize(o: { client_id: string; callback: (r: { credential?: string }) => void; auto_select?: boolean; ux_mode?: string; use_fedcm_for_prompt?: boolean }): void;
        renderButton(el: HTMLElement, o: Record<string, unknown>): void;
        disableAutoSelect(): void;
      };
    };
  };
};
const win = window as Win;

export type AuthKind = "android" | "web" | "test" | "none";

export function authKind(): AuthKind {
  if (win.BombeRushAuth) return "android";
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (local && new URLSearchParams(location.search).get("auth") === "test") return "test";
  if (location.protocol === "https:" || local) return "web";
  return "none";
}

/** Erreur lisible pour le joueur (pas de détails techniques). */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly cancelled = false,
  ) {
    super(message);
  }
}

const pending = new Map<string, (r: { status: string; idToken?: string; message?: string }) => void>();
let seq = 0;

/** Appli Android : ouvre la fenêtre Google officielle (choix du compte). */
export function nativeSignIn(serverClientId: string): Promise<string> {
  const native = win.BombeRushAuth;
  if (!native) return Promise.reject(new AuthError("Connexion Google indisponible sur cet appareil."));
  win.__bombeRushAuthResult = (id, json) => {
    const cb = pending.get(id);
    pending.delete(id);
    try {
      cb?.(JSON.parse(json));
    } catch {
      cb?.({ status: "error" });
    }
  };
  return new Promise((resolve, reject) => {
    const id = `a${++seq}`;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new AuthError("La connexion Google ne répond pas. Réessaie."));
    }, 120_000);
    pending.set(id, (r) => {
      clearTimeout(timer);
      if (r.status === "ok" && r.idToken) resolve(r.idToken);
      else if (r.status === "cancelled") reject(new AuthError("Connexion annulée.", true));
      else if (r.status === "noAccount") reject(new AuthError("Aucun compte Google sur ce téléphone. Ajoute-en un dans les réglages Android, puis réessaie."));
      else reject(new AuthError("La connexion Google a échoué. Vérifie ton réseau et réessaie."));
    });
    native.signIn(serverClientId, id);
  });
}

/** Navigateur : charge le script officiel Google une seule fois. */
let gisLoading: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (win.google?.accounts?.id) return Promise.resolve();
  gisLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisLoading = null;
      reject(new AuthError("Impossible de joindre Google. Vérifie ton réseau."));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

/**
 * Navigateur : affiche le bouton officiel « Se connecter avec Google » dans
 * `el` ; `onToken` reçoit le jeton quand le joueur a choisi son compte.
 */
export async function renderWebButton(el: HTMLElement, clientId: string, onToken: (t: string) => void, onError: (e: AuthError) => void): Promise<void> {
  try {
    await loadGis();
  } catch (e) {
    onError(e as AuthError);
    return;
  }
  const id = win.google!.accounts.id;
  id.initialize({
    client_id: clientId,
    callback: (r) => (r.credential ? onToken(r.credential) : onError(new AuthError("Connexion annulée.", true))),
    auto_select: false,
    use_fedcm_for_prompt: true,
  });
  el.innerHTML = "";
  id.renderButton(el, { theme: "filled_blue", size: "large", shape: "pill", text: "signin_with", locale: "fr", width: 260 });
}

/** Tests en local (?auth=test) : jeton préparé par le banc d'essai. */
export function testSignIn(): Promise<string> {
  const t = win.__bombeRushTestToken;
  return t ? Promise.resolve(t) : Promise.reject(new AuthError("Connexion annulée.", true));
}

/** Oublie le compte choisi (prochaine connexion : choix du compte à nouveau). */
export function forgetGoogleAccount(): void {
  try {
    win.BombeRushAuth?.signOut();
    win.google?.accounts?.id?.disableAutoSelect();
  } catch {
    /* rien à faire */
  }
}
