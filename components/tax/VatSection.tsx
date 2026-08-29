"use client";

import { useState } from "react";
import { Badge, Card, CardHeader, Money, type BadgeTone } from "@/components/ui/primitives";
import { selectClass } from "@/components/ui/CreatePanel";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { VAT_BOX_LABELS, type VatNineBox } from "@/lib/vat/nine-box";
import type { RegistrationThresholdCheck } from "@/lib/vat/threshold";

const STATUS: Record<RegistrationThresholdCheck["status"], { label: string; tone: BadgeTone }> = {
  clear: { label: "Clear", tone: "positive" },
  approaching: { label: "Approaching", tone: "warning" },
  exceeded: { label: "Over the threshold", tone: "danger" },
};

export function VatThreshold({ check }: { check: RegistrationThresholdCheck }) {
  const status = STATUS[check.status];

  return (
    <Card>
      <CardHeader title="VAT registration threshold" action={<Badge tone={status.tone}>{status.label}</Badge>} />
      <div className="grid gap-4 px-4 py-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="text-2xs font-medium uppercase tracking-[0.08em] text-ink-muted">
            Trailing 12-month turnover
          </dt>
          <dd>
            <Money size="lg">{formatMoney(check.rollingTurnoverPence)}</Money>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-2xs font-medium uppercase tracking-[0.08em] text-ink-muted">Threshold</dt>
          <dd>
            <Money size="lg" tone="muted">{formatMoney(check.thresholdPence)}</Money>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-2xs font-medium uppercase tracking-[0.08em] text-ink-muted">
            {check.headroomPence >= BigInt(0) ? "Headroom left" : "Over by"}
          </dt>
          <dd>
            <Money
              size="lg"
              tone={check.headroomPence >= BigInt(0) ? "default" : "danger"}
            >
              {formatMoney(
                check.headroomPence >= BigInt(0) ? check.headroomPence : -check.headroomPence
              )}
            </Money>
          </dd>
        </div>
      </div>

      {check.status === "exceeded" ? (
        <p className="border-t border-[var(--border)] px-4 py-3 text-sm text-danger">
          Your trailing 12-month taxable turnover is over the registration threshold. You must
          register for VAT by <strong>{formatDate(check.mustRegisterBy!)}</strong> — HMRC would
          set your effective registration date to{" "}
          <strong>{formatDate(check.effectiveRegistrationDate!)}</strong>.
        </p>
      ) : (
        <p className="border-t border-[var(--border)] px-4 py-3 text-xs text-ink-muted">
          You must also register if you expect turnover to go over the threshold in the next 30
          days alone — not just on the trailing-12-month figure above, which only looks backward.
          Threshold from{" "}
          <a className="underline" href="https://www.gov.uk/register-for-vat" target="_blank" rel="noreferrer">
            gov.uk
          </a>
          . Not currently VAT-registered — nothing is due.
        </p>
      )}
    </Card>
  );
}

export interface VatPeriodOption {
  label: string;
  dueOn: string;
  nineBox: VatNineBox;
}

const BOX_ORDER = ["box1", "box2", "box3", "box4", "box5", "box6", "box7", "box8", "box9"] as const;

export function VatNineBoxPreview({ periods }: { periods: VatPeriodOption[] }) {
  const [index, setIndex] = useState(0);
  const period = periods[index];

  if (!period) return null;

  return (
    <Card>
      <CardHeader
        title="VAT return preview"
        action={
          <select
            className={selectClass}
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
          >
            {periods.map((p, i) => (
              <option key={p.label} value={i}>{p.label}</option>
            ))}
          </select>
        }
      />

      <dl className="grid gap-4 px-4 py-4 sm:grid-cols-3 lg:grid-cols-5">
        {BOX_ORDER.map((box) => (
          <div key={box} className="flex flex-col gap-1">
            <dt className="text-2xs font-medium uppercase tracking-[0.08em] text-ink-muted">
              Box {box.slice(3)}
            </dt>
            <dd title={VAT_BOX_LABELS[box]}>
              <Money
                size={box === "box5" ? "lg" : "base"}
                tone={box === "box5" ? "danger" : "default"}
              >
                {formatMoney(period.nineBox[box])}
              </Money>
            </dd>
          </div>
        ))}
      </dl>

      <p className="border-t border-[var(--border)] px-4 py-3 text-xs text-ink-muted">
        Box 5 is{" "}
        {period.nineBox.box5Direction === "payable" ? "payable to HMRC" : "reclaimable from HMRC"}
        , would be due {formatDate(period.dueOn)}{" "}
        if registered. Standard scheme, calendar
        quarters — not your real HMRC stagger group if you register, since that isn&rsquo;t known
        yet. Built from invoices and company expenses already in the app; not currently
        VAT-registered, so nothing here is owed or has been filed.
      </p>
    </Card>
  );
}
