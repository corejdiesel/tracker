import { toPence } from "@/lib/money";
import type { Cadence, RecurringCost } from "./types";

/**
 * Normalise a cost to what it actually costs per month, so a £300 annual
 * subscription and a £25 monthly one are comparable in one column.
 * Annual and quarterly divide exactly in pence; any remainder is dropped
 * rather than rounded up, keeping the monthly burn a floor not a ceiling.
 */
export function monthlyPence(amountPence: bigint, cadence: Cadence): bigint {
  switch (cadence) {
    case "monthly":
      return amountPence;
    case "quarterly":
      return amountPence / BigInt(3);
    case "annual":
      return amountPence / BigInt(12);
  }
}

export function annualPence(amountPence: bigint, cadence: Cadence): bigint {
  switch (cadence) {
    case "monthly":
      return amountPence * BigInt(12);
    case "quarterly":
      return amountPence * BigInt(4);
    case "annual":
      return amountPence;
  }
}

/** Total monthly burn across the active costs. */
export function monthlyBurn(costs: readonly RecurringCost[]): bigint {
  return costs
    .filter((c) => c.active)
    .reduce<bigint>((total, c) => total + monthlyPence(toPence(c.amount_pence), c.cadence), BigInt(0));
}

/**
 * What leaves the account between `from` and `to`, counting each cost's
 * charge dates. Used by the cash forecast and by "safe to spend" — so it
 * walks real charge dates rather than pro-rating a monthly average.
 */
export function committedBetween(
  costs: readonly RecurringCost[],
  from: IsoDateString,
  to: IsoDateString
): bigint {
  let total = BigInt(0);

  for (const cost of costs) {
    if (!cost.active) continue;
    const amount = toPence(cost.amount_pence);
    let charge = cost.next_charge_on;

    // Costs are charged on a fixed cadence from next_charge_on. Walk forward
    // until past the window; a cost whose next charge is already past the
    // window contributes nothing.
    while (charge <= to) {
      if (charge >= from) total += amount;
      charge = advance(charge, cost.cadence);
    }
  }

  return total;
}

type IsoDateString = string;

/** Next charge date, clamping to month end (31 Jan + 1 month → 28/29 Feb). */
export function advance(iso: IsoDateString, cadence: Cadence): IsoDateString {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const months = cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12;

  const targetMonthIndex = m - 1 + months;
  const targetYear = y + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;

  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${targetYear}-${pad(targetMonth + 1)}-${pad(day)}`;
}
