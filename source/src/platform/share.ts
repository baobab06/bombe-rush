/**
 * Partage natif : feuille de partage Android (WhatsApp, Messenger, SMS,
 * Discord…) via le plugin Capacitor Share dans l'APK, Web Share API dans un
 * navigateur mobile, et à défaut copie du lien dans le presse-papiers.
 */
import { androidApp } from "./native";
import { t, tLines } from "../i18n/i18n";

type CapShare = { share(o: { title?: string; text?: string; url?: string; dialogTitle?: string }): Promise<unknown> };

function capShare(): CapShare | null {
  const w = window as unknown as { Capacitor?: { Plugins?: { Share?: CapShare } } };
  return w.Capacitor?.Plugins?.Share ?? null;
}

export async function copyText(text: string): Promise<boolean> {
  text = tLines(text);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // repli : sélection d'un champ caché
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;left:0;top:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

export async function shareInvite(o: { title: string; text: string; url: string }): Promise<ShareResult> {
  o = { ...o, title: t(o.title), text: tLines(o.text) };
  const cap = capShare();
  const app = androidApp();
  try {
    if (app) {
      app.share(o.text, t("Inviter des amis"));
      return "shared";
    }
    if (cap) {
      await cap.share({ title: o.title, text: o.text, url: o.url, dialogTitle: t("Inviter des amis") });
      return "shared";
    }
    if (navigator.share) {
      // le lien est déjà dans le texte : on ne le passe pas deux fois
      // (sinon WhatsApp l'affiche en double)
      await navigator.share({ title: o.title, text: o.text });
      return "shared";
    }
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return "cancelled";
    // partage refusé (aperçu, navigateur de bureau…) : on copie
  }
  return (await copyText(`${o.text}`)) ? "copied" : "failed";
}

/**
 * Partage d'une image (carte joueur) : appli Android → feuille de partage
 * avec l'image ; navigateur → partage de fichier si possible, sinon
 * téléchargement de l'image.
 */
export async function shareImage(canvas: HTMLCanvasElement, o: { title: string; text: string; file: string }): Promise<ShareResult> {
  o = { ...o, title: t(o.title), text: tLines(o.text) };
  const app = androidApp();
  const url = canvas.toDataURL("image/png");
  try {
    if (app?.shareImage) {
      app.shareImage(url.slice(url.indexOf(",") + 1), o.text, o.title);
      return "shared";
    }
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
    if (blob && navigator.canShare) {
      const f = new File([blob], o.file, { type: "image/png" });
      if (navigator.canShare({ files: [f] })) {
        await navigator.share({ files: [f], title: o.title, text: o.text });
        return "shared";
      }
    }
    if (app) {
      app.share(o.text, o.title);
      return "shared";
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = o.file;
    a.click();
    return "copied";
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return "cancelled";
    return "failed";
  }
}
