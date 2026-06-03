export interface OddsPercentages {
  home: number | null;
  draw: number | null;
  away: number | null;
}

/**
 * Converts decimal odds from The Odds API into normalized implied
 * probabilities that always add up to 100 (e.g. Home 45%, Draw 30%, Away 25%).
 */
export const calculateOddsPercentages = (
  homeOdds: number | null,
  drawOdds: number | null,
  awayOdds: number | null,
): OddsPercentages => {
  const impliedValues = [homeOdds, drawOdds, awayOdds].map((odds) =>
    typeof odds === "number" && odds > 0 ? 1 / odds : null,
  );

  const impliedTotal = impliedValues.reduce<number>(
    (total, value) => total + (value ?? 0),
    0,
  );

  if (impliedTotal <= 0) {
    return { home: null, draw: null, away: null };
  }

  const percentages = impliedValues.map((value) =>
    value === null ? null : Math.round((value / impliedTotal) * 100),
  );

  // Rounding can leave the sum at 99 or 101; absorb the drift into the
  // largest share so the displayed split always totals 100.
  const roundedTotal = percentages.reduce<number>(
    (total, value) => total + (value ?? 0),
    0,
  );
  const drift = 100 - roundedTotal;

  if (drift !== 0) {
    let largestIndex = -1;

    for (let index = 0; index < percentages.length; index += 1) {
      const value = percentages[index];

      if (
        value !== null &&
        (largestIndex === -1 || value > (percentages[largestIndex] ?? 0))
      ) {
        largestIndex = index;
      }
    }

    if (largestIndex !== -1) {
      percentages[largestIndex] = (percentages[largestIndex] ?? 0) + drift;
    }
  }

  return {
    home: percentages[0],
    draw: percentages[1],
    away: percentages[2],
  };
};

export const formatPercentage = (value: number | null): string =>
  value === null ? "N/A" : `${value}%`;
