// Calendrier d'un challenge (section 6). Le jour i s'ouvre à l'heure locale H
// (heure de lancement) dans le fuseau du challenge, à la date de lancement + i.
// Un changement d'heure donne donc un jour de 23 ou 25 heures, sans autre effet.
//
// Mode « jours rapides » (alpha) : si dayMs est défini, chaque jour dure dayMs.

const fmtCache = new Map();
function formatter(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric",
    }));
  }
  return fmtCache.get(tz);
}

export function isValidTimeZone(tz) {
  try { formatter(tz); return true; } catch { return false; }
}

/** Date et heure locales d'un instant UTC dans un fuseau. */
export function localParts(ms, tz) {
  const p = {};
  for (const { type, value } of formatter(tz).formatToParts(new Date(ms))) p[type] = Number(value);
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

/** Décalage du fuseau (ms) à un instant donné : heure locale − UTC. */
export function tzOffsetMs(ms, tz) {
  const p = localParts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/** Instant UTC correspondant à une heure locale (une heure qui n'existe pas glisse vers l'avant). */
export function zonedTimeToUtc({ y, m, d, h, mi, s }, tz) {
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  const off1 = tzOffsetMs(guess - tzOffsetMs(guess, tz), tz);
  const utc = guess - off1;
  const off2 = tzOffsetMs(utc, tz);
  return off2 === off1 ? utc : guess - off2;
}

/** Ouverture du jour i (0 = jour du lancement). Le jour i se clôt à l'ouverture du jour i + 1. */
export function dayOpen(ch, i) {
  if (ch.dayMs) return ch.launchedAt + i * ch.dayMs;
  const p = localParts(ch.launchedAt, ch.tz);
  if (i === 0) return ch.launchedAt;
  return zonedTimeToUtc({ ...p, d: p.d + i }, ch.tz);
}

export const dayClose = (ch, i) => dayOpen(ch, i + 1);
/** Fin du rattrapage du jour i = clôture du jour suivant (résultats définitifs). */
export const catchupEnd = (ch, i) => dayOpen(ch, i + 2);
/** Fin du challenge : 24 h après la clôture du dernier jour. */
export const challengeEnd = (ch) => dayOpen(ch, ch.durationDays + 1);

/** Indice du jour ouvert à cet instant, ou −1 / durationDays hors période de jeu. */
export function currentDay(ch, now) {
  if (now < ch.launchedAt) return -1;
  if (ch.dayMs) return Math.min(ch.durationDays, Math.floor((now - ch.launchedAt) / ch.dayMs));
  for (let i = 0; i < ch.durationDays; i++) if (now < dayClose(ch, i)) return i;
  return ch.durationDays;
}
