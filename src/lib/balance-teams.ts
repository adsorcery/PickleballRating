export interface Rated {
  id: string;
  rating: number;
}

/**
 * Re-pairs four players into the two teams whose average ratings are closest. Uses the unrounded
 * ratings; a tie keeps the current arrangement. Returns ids ordered [A1, A2, B1, B2]. Purely a
 * convenience for the predictor: it reads ratings and writes nothing.
 */
export function balanceTeams(players: readonly [Rated, Rated, Rated, Rated]): [string, string, string, string] {
  const [p0, p1, p2, p3] = players;
  const options: [Rated, Rated, Rated, Rated][] = [
    [p0, p1, p2, p3],
    [p0, p2, p1, p3],
    [p0, p3, p1, p2],
  ];
  const gap = ([a, b, c, d]: Rated[]) => Math.abs((a.rating + b.rating) / 2 - (c.rating + d.rating) / 2);
  let best = options[0];
  for (const o of options) if (gap(o) < gap(best) - 1e-12) best = o;
  return [best[0].id, best[1].id, best[2].id, best[3].id];
}
