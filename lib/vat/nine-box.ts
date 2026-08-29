/**
 * VAT return "nine-box" computation — standard scheme only.
 *
 * Standard scheme only, not Flat Rate: W Technologies Ltd isn't
 * VAT-registered and hasn't elected a scheme, so there's nothing to build
 * Flat Rate's numbers around yet (its Box 1 is a flat percentage of gross
 * turnover, not derived from actual VAT charged — a different shape of
 * input entirely). Standard scheme is also the correct default to preview
 * against: it's what a new registration gets unless the trader actively
 * elects otherwise.
 *
 * ROUNDING RULES (Source: Countingup "Format and rounding on VAT return
 * boxes" + HMRC's own VAT-API docs — boxes 1–5 to 2dp, boxes 6–9 whole
 * pounds rounded down: https://support.countingup.com/hc/en-us/articles/4402585896977,
 * fetched 29 Aug 2026):
 *   - Boxes 1–5: pounds and pence, to the nearest penny. Kept as exact
 *     bigint pence throughout, so no rounding actually happens — the
 *     inputs are already whole pence.
 *   - Boxes 6–9: whole pounds only, rounded DOWN. Guaranteed to be
 *     whole-pound multiples (pence portion always 0) by truncation.
 *
 * All values are pence (bigint), matching every other money figure in this
 * app.
 */

export interface VatNineBox {
  /** VAT due on sales and other outputs. */
  box1: bigint;
  /** VAT due on acquisitions (Northern Ireland only — see box2 note below). */
  box2: bigint;
  /** Total VAT due (Box 1 + Box 2). */
  box3: bigint;
  /** VAT reclaimed on purchases and other inputs. */
  box4: bigint;
  /** Net VAT to pay HMRC or reclaim — the absolute difference of Box 3 and Box 4. */
  box5: bigint;
  /** Total value of sales and other outputs excluding VAT (whole pounds). */
  box6: bigint;
  /** Total value of purchases and other inputs excluding VAT (whole pounds). */
  box7: bigint;
  /** Total value of goods supplied to NI/EU (out of scope — see box8/9 note). */
  box8: bigint;
  /** Total value of goods acquired from NI/EU (out of scope — see box8/9 note). */
  box9: bigint;
  /** "payable" when Box 3 ≥ Box 4 (owed to HMRC), "reclaim" when Box 4 > Box 3
   * (HMRC owes the business). Box 5 itself is always non-negative. */
  box5Direction: "payable" | "reclaim";
}

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);

function abs(n: bigint): bigint {
  return n < ZERO ? -n : n;
}

/** Truncate a pence amount DOWN to a whole number of pounds, returned in
 * pence (always a multiple of 100). Rounds toward zero, which for the
 * non-negative box totals here is the same as rounding down. */
function truncateToWholePoundsPence(pence: bigint): bigint {
  const a = abs(pence);
  const truncated = (a / HUNDRED) * HUNDRED;
  return pence < ZERO ? -truncated : truncated;
}

export interface StandardInputs {
  /** Output VAT collected on sales, in pence — sum of invoices.vat_pence
   * for non-draft invoices issued in the period. */
  outputVatPence: bigint;
  /** Input VAT paid on purchases, in pence — sum of company expenses.vat_pence
   * spent in the period. */
  inputVatPence: bigint;
  /** Net sales excluding VAT, in pence — sum of invoices.subtotal_pence. */
  netSalesPence: bigint;
  /** Net purchases excluding VAT, in pence — sum of company expenses.net_pence. */
  netPurchasesPence: bigint;
}

/**
 * Box 1 = output VAT on sales. Box 2 = 0 — post-Brexit, a GB business no
 * longer accounts for EU acquisition VAT in Box 2; Northern Ireland goods
 * movements are out of scope for this app. Box 3 = Box 1 + Box 2. Box 4 =
 * input VAT reclaimable on purchases. Box 5 = |Box 3 − Box 4|. Box 6/7 =
 * net sales/purchases excluding VAT, whole pounds rounded down. Box 8/9 = 0
 * for the same reason as Box 2.
 */
export function computeStandardNineBox(inputs: StandardInputs): VatNineBox {
  const box1 = inputs.outputVatPence;
  const box2 = ZERO;
  const box3 = box1 + box2;
  const box4 = inputs.inputVatPence;
  const box5 = abs(box3 - box4);
  const box6 = truncateToWholePoundsPence(inputs.netSalesPence);
  const box7 = truncateToWholePoundsPence(inputs.netPurchasesPence);
  return {
    box1, box2, box3, box4, box5, box6, box7,
    box8: ZERO,
    box9: ZERO,
    box5Direction: box3 >= box4 ? "payable" : "reclaim",
  };
}

/** Box labels for display — HMRC's own wording. */
export const VAT_BOX_LABELS: Record<keyof Omit<VatNineBox, "box5Direction">, string> = {
  box1: "VAT due on sales and other outputs",
  box2: "VAT due on acquisitions (NI only)",
  box3: "Total VAT due (Box 1 + Box 2)",
  box4: "VAT reclaimed on purchases and other inputs",
  box5: "Net VAT to pay or reclaim",
  box6: "Total value of sales excluding VAT",
  box7: "Total value of purchases excluding VAT",
  box8: "Total value of goods supplied (NI only)",
  box9: "Total value of goods acquired (NI only)",
};
