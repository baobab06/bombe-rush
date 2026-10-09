/**
 * HEURE « DE CONFIANCE » pour les renouvellements (jour, semaine).
 *
 * Ce que ça protège :
 *  - reculer l'heure du téléphone ne fait JAMAIS revenir un jour passé
 *    (on garde la plus grande date déjà vue : impossible de réclamer deux
 *    fois la même récompense quotidienne) ;
 *  - quand le jeu a pu joindre le serveur, on corrige l'heure du téléphone
 *    avec celle du serveur (avancer l'horloge ne sert alors plus à rien).
 *
 * Limite honnête : hors ligne, la sauvegarde est locale. Quelqu'un qui avance
 * l'heure de son téléphone SANS connexion peut obtenir les missions du
 * lendemain plus tôt (mais il sera ensuite bloqué jusqu'à ce que la vraie
 * date rattrape la fausse). Une vraie protection demanderait des comptes
 * vérifiés par le serveur.
 */
import type { Profile } from "./profile";

/** Écart maximal accepté avec le serveur (au-delà : réponse ignorée). */
const MAX_OFFSET = 400 * 86400000;

/** Date à utiliser pour tout ce qui se renouvelle (ne recule jamais). */
export function trustedNow(p: Profile, real: Date = new Date()): Date {
  const t = real.getTime() + (p.clock.offset || 0);
  if (t > p.clock.max) p.clock.max = t;
  return new Date(Math.max(t, p.clock.max));
}

/** Heure du serveur reçue : on mémorise le décalage avec le téléphone. */
export function setServerTime(p: Profile, serverMs: number, real = Date.now()) {
  if (!Number.isFinite(serverMs)) return;
  const off = serverMs - real;
  if (Math.abs(off) > MAX_OFFSET) return;
  // moins d'une minute d'écart : inutile de corriger
  p.clock.offset = Math.abs(off) < 60000 ? 0 : Math.round(off);
}
