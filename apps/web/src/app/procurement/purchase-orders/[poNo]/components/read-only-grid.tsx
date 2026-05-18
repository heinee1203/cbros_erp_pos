import type { PODetail } from "@/hooks/use-po-query";
import { SectionHeader, Th } from "./shared";

type ReadOnlyGridProps = {
  po: PODetail;
  isTerminal: boolean;
};

export function ReadOnlyGrid({ po, isTerminal }: ReadOnlyGridProps) {
  return (
    <section>
      <SectionHeader>
        Line Items
        {isTerminal && (
          <span className="ml-2 text-[10px] font-normal text-muted-foreground">
            (read-only \u2014 PO is in terminal state)
          </span>
        )}
      </SectionHeader>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <Th align="left">Item</Th>
              <Th align="right">Ordered</Th>
              <Th align="right">List Price</Th>
              <Th align="right">Discount</Th>
              <Th align="right">Net Cost</Th>
              <Th align="right">Accepted</Th>
              <Th align="right">Rejected</Th>
              <Th align="right">Remaining</Th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((line, index) => {
              const remaining = line.orderedQty - line.receivedAcceptedQty - line.rejectedQty;

              return (
                <tr
                  key={line.id}
                  className={`border-b border-border ${
                    index % 2 === 0 ? "bg-background" : "bg-muted/20"
                  }`}
                >
                  <td className="px-3 py-1.5">
                    <div className="text-sm">
                      {(line as any).parentName ? `${(line as any).parentName} (${line.productName})` : line.productName}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {line.sku}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                    {line.orderedQty}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {line.listPrice ? `\u20B1${line.listPrice}` : "\u2014"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {line.discountChain
                      ? line.discountChain.split(",").map((value) => value.trim()).join("/")
                      : "\u2014"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {line.unitCost}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium text-success">
                    {line.receivedAcceptedQty}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium text-destructive">
                    {line.rejectedQty > 0 ? line.rejectedQty : "\u2014"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                    {remaining > 0 ? (
                      <span className="text-warning">{remaining}</span>
                    ) : (
                      <span className="text-success">0</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
