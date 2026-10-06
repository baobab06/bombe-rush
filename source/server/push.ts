/**
 * NOTIFICATIONS PUSH (Firebase Cloud Messaging, API HTTP v1).
 *
 * ⚠️ Inactif tant que les variables d'environnement ne sont pas définies :
 *   FCM_PROJECT_ID          identifiant du projet Firebase
 *   FCM_SERVICE_ACCOUNT     contenu JSON du compte de service (clé privée)
 * Côté APK : ajouter google-services.json + @capacitor/push-notifications
 * (voir README, section « Notifications »).
 *
 * Sans configuration, aucune notification n'est envoyée et le serveur le
 * signale dans ses logs : on ne fait pas semblant.
 */
import { createSign } from "node:crypto";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export class PushService {
  private tokens = new Map<string, { platform: string; token: string }>();
  private account: ServiceAccount | null = null;
  private projectId = process.env.FCM_PROJECT_ID ?? "";
  private accessToken = "";
  private accessExp = 0;

  constructor() {
    const raw = process.env.FCM_SERVICE_ACCOUNT;
    if (raw && this.projectId) {
      try {
        this.account = JSON.parse(raw) as ServiceAccount;
      } catch {
        console.warn("[push] FCM_SERVICE_ACCOUNT n'est pas un JSON valide");
      }
    }
    console.log(this.account ? "[push] FCM configuré" : "[push] non configuré : notifications push désactivées");
  }

  get enabled() {
    return !!this.account;
  }

  register(clientToken: string, platform: string, token: string) {
    this.tokens.set(clientToken, { platform, token });
  }

  async notify(clientTokens: string[], title: string, body: string) {
    if (!this.account) return;
    for (const ct of clientTokens) {
      const t = this.tokens.get(ct);
      if (!t) continue;
      try {
        await this.send(t.token, title, body);
      } catch (e) {
        console.warn("[push] échec d'envoi", (e as Error).message);
      }
    }
  }

  private async bearer(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessExp - 60_000) return this.accessToken;
    const a = this.account!;
    const now = Math.floor(Date.now() / 1000);
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
      iss: a.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })}`;
    const sig = createSign("RSA-SHA256").update(unsigned).sign(a.private_key, "base64url");
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${unsigned}.${sig}`,
    });
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.accessToken = json.access_token;
    this.accessExp = Date.now() + json.expires_in * 1000;
    return this.accessToken;
  }

  private async send(token: string, title: string, body: string) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${await this.bearer()}`, "content-type": "application/json" },
      body: JSON.stringify({ message: { token, notification: { title, body }, android: { priority: "high" } } }),
    });
    if (!res.ok) throw new Error(`FCM ${res.status}`);
  }
}
