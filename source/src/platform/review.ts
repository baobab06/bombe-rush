/**
 * Demande de note Google Play (fenêtre officielle « In-App Review »).
 *
 * Proposée seulement dans l'appli Android, après une victoire, à un joueur
 * qui a déjà fait quelques parties ; au plus une fois par mois et 4 fois en
 * tout. Google décide en plus lui-même s'il affiche la fenêtre (quota).
 */
import { androidApp } from "./native";

const KEY = "bomberush.review";
export const REVIEW_MIN_GAMES = 5;
const GAP_MS = 30 * 86400_000;
const MAX_ASKS = 4;

interface State {
  n: number;
  at: number;
}

function load(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as State | null;
    return s && typeof s.n === "number" ? s : { n: 0, at: 0 };
  } catch {
    return { n: 0, at: 0 };
  }
}

/** La demande doit-elle être faite maintenant ? (pure, testable) */
export function reviewDue(played: number, s: State, now: number): boolean {
  return played >= REVIEW_MIN_GAMES && s.n < MAX_ASKS && now - s.at >= GAP_MS;
}

/** Après une victoire : demande la note si c'est le bon moment. true = demandée. */
export function maybeAskReview(played: number, now = Date.now()): boolean {
  const app = androidApp();
  if (!app?.requestReview) return false;
  const s = load();
  if (!reviewDue(played, s, now)) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify({ n: s.n + 1, at: now }));
  } catch {
    return false;
  }
  try {
    app.requestReview();
    return true;
  } catch {
    return false;
  }
}
