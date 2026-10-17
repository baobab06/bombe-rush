// Points du jour et classement du challenge (section 5 du cahier des charges).

/**
 * Points du rang r parmi n joueurs classés : arrondi(1 + 9 × (n − r) / (n − 1)).
 * Calcul en entiers pour que 0,5 soit toujours arrondi vers le haut.
 */
export function pointsForRank(n, r) {
  if (n <= 1) return 10;
  const num = (n - 1) + 9 * (n - r);
  const den = n - 1;
  return Math.floor((2 * num + den) / (2 * den));
}

function secondaryKey(value, order) {
  if (value === null || value === undefined) return order === "asc" ? Infinity : -Infinity;
  return value;
}

/** Compare deux entrées : score décroissant, puis critère secondaire du mini-jeu. */
export function compareEntries(a, b, order) {
  if (a.score !== b.score) return b.score - a.score;
  const sa = secondaryKey(a.secondary, order), sb = secondaryKey(b.secondary, order);
  if (sa === sb) return 0;
  return order === "asc" ? (sa < sb ? -1 : 1) : (sa > sb ? -1 : 1);
}

/**
 * Classe les joueurs d'un jour. Ex æquo : même rang (le meilleur) et mêmes points.
 * entries : [{ userId, score, secondary }] — l'heure de validation n'est jamais utilisée.
 */
export function rankDay(entries, order) {
  const sorted = entries.slice().sort((a, b) => compareEntries(a, b, order));
  const n = sorted.length;
  const out = [];
  sorted.forEach((e, i) => {
    const prev = out[i - 1];
    const rank = prev && compareEntries(prev, e, order) === 0 ? prev.rank : i + 1;
    out.push({ ...e, rank, points: pointsForRank(n, rank) });
  });
  return out;
}

/**
 * Classement cumulé : somme des points du jour.
 * Départage : nombre de premières places, puis total des scores officiels, sinon ex æquo.
 */
export function challengeStandings(userIds, rankedDays) {
  const rows = new Map(userIds.map((id) => [id, { userId: id, points: 0, wins: 0, totalScore: 0, played: 0 }]));
  for (const day of rankedDays) {
    for (const e of day) {
      const row = rows.get(e.userId);
      if (!row) continue;
      row.points += e.points;
      row.totalScore += e.score;
      row.played++;
      if (e.rank === 1) row.wins++;
    }
  }
  const cmp = (a, b) => b.points - a.points || b.wins - a.wins || b.totalScore - a.totalScore;
  const sorted = [...rows.values()].sort(cmp);
  sorted.forEach((row, i) => {
    row.rank = i > 0 && cmp(sorted[i - 1], row) === 0 ? sorted[i - 1].rank : i + 1;
  });
  return sorted;
}
