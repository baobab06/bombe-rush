import type { Profile } from "./profile";

/**
 * État du tutoriel, enregistré dans le profil (et donc dans la sauvegarde en
 * ligne du compte) : new → offered → skipped | done. « done » ne redescend
 * jamais (revoir le tutoriel puis le passer ne l'efface pas).
 */
export type TutorialState = Profile["tutorial"]["state"];

export function setTutorial(p: Profile, state: TutorialState): void {
  if (p.tutorial?.state === "done" && state !== "done") return;
  p.tutorial = { state, at: Date.now() };
}

/** Le proposer en arrivant sur l'accueil ? (jamais vu, ou proposé sans réponse) */
export function shouldOfferTutorial(p: Profile): boolean {
  return !p.tutorial || p.tutorial.state === "new" || p.tutorial.state === "offered";
}
