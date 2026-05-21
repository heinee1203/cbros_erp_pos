import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

import type { DeltaResult } from "../types";

export function CompareBadges({
  mom,
  yoy,
}: {
  mom: DeltaResult;
  yoy: DeltaResult;
}) {
  if (!mom && !yoy) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {mom && <MoMPill result={mom} />}
      {yoy && <YoYPill result={yoy} />}
    </span>
  );
}

function MoMPill({ result }: { result: DeltaResult }) {
  if (result == null) return null;
  if (result.kind === "new") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-md bg-sky-600 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-white">
        NEW · MoM
      </span>
    );
  }
  const positive = result.delta > 0;
  const zero = result.delta === 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-bold tabular-nums",
        zero && "bg-slate-400 text-white",
        !zero && positive && "bg-emerald-600 text-white",
        !zero && !positive && "bg-red-600 text-white",
      )}
    >
      {positive ? <ArrowUpRight size={9} /> : !zero ? <ArrowDownRight size={9} /> : null}
      {positive ? "+" : ""}
      {result.pct.toFixed(1)}% MoM
    </span>
  );
}

function YoYPill({ result }: { result: DeltaResult }) {
  if (result == null) return null;
  if (result.kind === "new") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-md border border-sky-600 bg-transparent px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-sky-700">
        NEW · YoY
      </span>
    );
  }
  const positive = result.delta > 0;
  const zero = result.delta === 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border bg-transparent px-1.5 py-0.5 text-[9px] font-bold tabular-nums",
        zero && "border-slate-400 text-slate-600",
        !zero && positive && "border-emerald-600 text-emerald-700",
        !zero && !positive && "border-red-600 text-red-700",
      )}
    >
      {positive ? <ArrowUpRight size={9} /> : !zero ? <ArrowDownRight size={9} /> : null}
      {positive ? "+" : ""}
      {result.pct.toFixed(1)}% YoY
    </span>
  );
}
