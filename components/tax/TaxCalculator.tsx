"use client";

import { useMemo, useState } from "react";
import { Card, CardHeader, Field, Money, inputClass } from "@/components/ui/primitives";
import { calculateCompanyTaxPicture } from "@/lib/tax-company/combined";
import { formatMoney, parsePounds } from "@/lib/money";

const CT_YEAR = "FY2023" as const;
const DIVIDEND_YEAR = "2026-27" as const;

/** A pounds input backed by string state, so a half-typed "12," doesn't
 * fight the user — parsing and clamping only happen at read time. */
function useAmountField(initialPence: bigint) {
  const [raw, setRaw] = useState(() => (Number(initialPence) / 100).toFixed(2));
  const pence = parsePounds(raw) ?? BigInt(0);
  return { raw, setRaw, pence };
}

export function TaxCalculator({
  defaultProfitPence,
}: {
  defaultProfitPence: bigint;
}) {
  const profit = useAmountField(defaultProfitPence);
  const dividend = useAmountField(BigInt(0));
  const otherIncome = useAmountField(BigInt(0));

  const result = useMemo(
    () =>
      calculateCompanyTaxPicture({
        profitBeforeTaxPence: profit.pence,
        dividendPence: dividend.pence,
        otherPersonalIncomePence: otherIncome.pence,
        ctYear: CT_YEAR,
        dividendYear: DIVIDEND_YEAR,
      }),
    [profit.pence, dividend.pence, otherIncome.pence]
  );

  return (
    <Card>
      <CardHeader title="Tax calculator" />

      <div className="grid gap-4 border-b border-[var(--border)] px-4 py-4 sm:grid-cols-3">
        <Field label="Company profit before tax" hint="Editable — see the note below on where this starts from.">
          <input
            className={inputClass}
            inputMode="decimal"
            value={profit.raw}
            onChange={(e) => profit.setRaw(e.target.value)}
          />
        </Field>
        <Field label="Dividend to draw">
          <input
            className={inputClass}
            inputMode="decimal"
            value={dividend.raw}
            onChange={(e) => dividend.setRaw(e.target.value)}
          />
        </Field>
        <Field label="Other personal income" hint="Salary, other employment, property, etc.">
          <input
            className={inputClass}
            inputMode="decimal"
            value={otherIncome.raw}
            onChange={(e) => otherIncome.setRaw(e.target.value)}
          />
        </Field>
      </div>

      <dl className="grid gap-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Corporation Tax" value={formatMoney(result.corporationTaxPence)} />
        <Stat label="Left to distribute" value={formatMoney(result.distributableProfitPence)} />
        <Stat label="Dividend tax" value={formatMoney(result.dividendTaxPence)} />
        <Stat label="Total tax" value={formatMoney(result.totalTaxPence)} tone="danger" />
      </dl>

      <p className="border-t border-[var(--border)] px-4 py-3 text-xs text-ink-muted">
        Corporation Tax rates from{" "}
        <a className="underline" href="https://www.gov.uk/guidance/corporation-tax-marginal-relief" target="_blank" rel="noreferrer">
          gov.uk
        </a>{" "}
        (FY2023, unchanged through 2026). Dividend tax rates for 2026-27 from{" "}
        <a className="underline" href="https://www.gov.uk/tax-on-dividends" target="_blank" rel="noreferrer">
          gov.uk
        </a>
        . This is an estimate for planning, not a filed position — it does not model salary
        NI, Scottish income tax, or associated companies. Nothing here has been submitted to
        HMRC.
      </p>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-2xs font-medium uppercase tracking-[0.08em] text-ink-muted">{label}</dt>
      <dd>
        <Money size="lg" tone={tone}>{value}</Money>
      </dd>
    </div>
  );
}
