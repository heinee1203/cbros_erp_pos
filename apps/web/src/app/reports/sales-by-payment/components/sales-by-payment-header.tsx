import { Download } from "lucide-react";
import type { SalesByPaymentController } from "../types";

type SalesByPaymentHeaderProps = {
  controller: SalesByPaymentController;
};

export function SalesByPaymentHeader({ controller }: SalesByPaymentHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Sales by Payment Method</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Revenue breakdown by payment type</p>
      </div>
      {controller.rows.length > 0 && (
        <button
          onClick={controller.exportCsv}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50"
        >
          <Download size={13} /> Export CSV
        </button>
      )}
    </div>
  );
}
