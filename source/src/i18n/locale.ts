/**
 * Langue courante, sans le dictionnaire : de quoi formater nombres et dates
 * (utilisable aussi côté serveur sans embarquer les traductions).
 * La langue est choisie au démarrage par i18n.ts.
 */
export type Lang = "fr" | "en" | "es" | "de" | "it" | "pt";
const LOCALE: Record<Lang, string> = { fr: "fr-FR", en: "en-GB", es: "es-ES", de: "de-DE", it: "it-IT", pt: "pt-BR" };
let current: Lang = "fr";
export const getLang = () => current;
export const setCurrentLang = (l: Lang) => { current = l; };
/** pour toLocaleString / toLocaleDateString */
export const locale = () => LOCALE[current];
