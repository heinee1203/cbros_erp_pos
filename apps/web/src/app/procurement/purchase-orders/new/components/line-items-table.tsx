import { fmtPeso } from "@/lib/format";
import type { POLineInput } from "../types";

type LineItemsTableProps = {
  lines: POLineInput[];
  grandTotal: number;
  onRemoveLine: (localId: string) => void;
  onUpdateLine: (
    localId: string,
    field: keyof POLineInput,
    value: string | number | boolean,
  ) => void;
};

export function LineItemsTable({
  lines,
  grandTotal,
  onRemoveLine,
  onUpdateLine,
}: LineItemsTableProps) {
  if (lines.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
        Search and add products above, or import from a CSV file.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th scope="col" className="w-8 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                #
              </th>
              <th scope="col" className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Item
              </th>
              <th scope="col" className="w-[120px] px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Qty
              </th>
              <th scope="col" className="w-28 px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                List Price
              </th>
              <th scope="col" className="w-24 px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Discount
              </th>
              <th scope="col" className="w-28 px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Net Cost
              </th>
              <th scope="col" className="w-28 px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total
              </th>
              <th scope="col" className="w-10 px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <LineItemRow
                key={line.localId}
                index={index}
                line={line}
                onRemoveLine={onRemoveLine}
                onUpdateLine={onUpdateLine}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {lines.length} item{lines.length !== 1 ? "s" : ""} -{" "}
          {lines.reduce((sum, line) => sum + line.orderedQty, 0)} units
        </span>
        <span className="text-sm font-semibold">
          Grand Total: {fmtPeso(grandTotal)}
        </span>
      </div>
    </div>
  );
}

function LineItemRow({
  index,
  line,
  onRemoveLine,
  onUpdateLine,
}: {
  index: number;
  line: POLineInput;
  onRemoveLine: (localId: string) => void;
  onUpdateLine: LineItemsTableProps["onUpdateLine"];
}) {
  const lineTotal = line.orderedQty * (parseFloat(line.netCost) || 0);
  const hasDiscount = line.discountChain.trim().length > 0;
  const isAutoCalc = hasDiscount && !line.isManualCost;

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-2 py-1.5 text-center text-xs text-muted-foreground">{index + 1}</td>
      <td className="px-2 py-1.5">
        <div className="text-sm font-medium leading-tight">{line.productName}</div>
        <div className="text-[10px] text-muted-foreground">{line.sku}</div>
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className="flex items-center justify-end gap-1">
          {line.unitsPerCase > 1 && (
            <select
              value={line.entryUnit}
              onChange={(event) => onUpdateLine(line.localId, "entryUnit", event.target.value as "piece" | "case")}
              className="w-auto rounded border border-border px-1 py-1 text-xs"
            >
              <option value="piece">pc</option>
              <option value="case">{line.packagingUnit || "case"} ({line.unitsPerCase}/cs)</option>
            </select>
          )}
          <input
            type="number"
            min={1}
            value={line.orderedQty}
            onChange={(event) => onUpdateLine(line.localId, "orderedQty", event.target.value)}
            className="w-16 rounded border border-border bg-background px-1.5 py-1 text-right font-mono text-sm tabular-nums outline-none focus:border-primary"
          />
        </div>
        {line.entryUnit === "case" && line.unitsPerCase > 1 && (
          <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
            = {line.orderedQty * line.unitsPerCase} pcs
          </div>
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        <input
          type="text"
          value={line.listPrice}
          onChange={(event) => onUpdateLine(line.localId, "listPrice", event.target.value)}
          className="w-full rounded border border-border bg-background px-1.5 py-1 text-right font-mono text-sm tabular-nums outline-none focus:border-primary"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <input
          type="text"
          value={line.discountChain}
          onChange={(event) => onUpdateLine(line.localId, "discountChain", event.target.value)}
          placeholder="e.g. 20,5,3"
          className="w-full rounded border border-border bg-background px-1.5 py-1 text-right font-mono text-sm tabular-nums outline-none placeholder:text-muted-foreground/40 focus:border-primary"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <input
          type="text"
          value={line.netCost}
          onChange={(event) => onUpdateLine(line.localId, "netCost", event.target.value)}
          readOnly={isAutoCalc}
          className={`w-full rounded border border-border px-1.5 py-1 text-right font-mono text-sm tabular-nums outline-none focus:border-primary ${
            isAutoCalc
              ? "cursor-default bg-muted/50 text-muted-foreground"
              : "bg-background"
          }`}
        />
      </td>
      <td className="px-2 py-1.5 text-right font-mono text-sm tabular-nums">
        {fmtPeso(lineTotal)}
      </td>
      <td className="px-2 py-1.5 text-right">
        <button
          onClick={() => onRemoveLine(line.localId)}
          className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </td>
    </tr>
  );
}
