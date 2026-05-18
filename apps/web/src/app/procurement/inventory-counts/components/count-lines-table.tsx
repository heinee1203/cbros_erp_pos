import type { CountDetailController } from "../lib/use-count-detail-controller";
import { CountLineTableRow } from "./count-line-table-row";

type CountLinesTableProps = {
  controller: CountDetailController;
};

export function CountLinesTable({ controller }: CountLinesTableProps) {
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-10 border-b border-border bg-muted/60">
          <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th scope="col" className="whitespace-nowrap px-3 py-2">
              Item
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2">
              SKU
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2">
              Category
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">
              System Qty
            </th>
            <th
              scope="col"
              className="whitespace-nowrap px-3 py-2 text-right"
              style={{ minWidth: 100 }}
            >
              Counted Qty
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">
              Variance
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {controller.lines.map((line, index) => (
            <CountLineTableRow
              key={line.id}
              line={line}
              odd={index % 2 === 1}
              editable={controller.isEditable}
              onRecord={controller.handleRecordCount}
            />
          ))}
        </tbody>
      </table>
      {controller.lines.length === 0 && !controller.isLoading && (
        <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
          {controller.debouncedLineSearch ||
          controller.varianceOnly ||
          controller.uncountedOnly
            ? "No lines match current filters"
            : "No items in this count session"}
        </div>
      )}
    </div>
  );
}
