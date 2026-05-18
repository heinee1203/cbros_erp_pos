import type { PODetail } from "@/hooks/use-po-query";
import { InfoChip, TimelineCard } from "./shared";

type SelectOption = {
  id: string;
  name: string;
};

type POHeaderDetailsProps = {
  po: PODetail;
  isEditing: boolean;
  isPartiallyReceived: boolean;
  isDraft: boolean;
  suppliers: SelectOption[];
  locations: SelectOption[];
  editSupplierId: string;
  editDestinationId: string;
  editExpectedDate: string;
  editNotes: string;
  totalOrdered: number;
  totalReceived: number;
  totalRejected: number;
  totalRemaining: number;
  pctReceived: number;
  onSupplierChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onExpectedDateChange: (value: string) => void;
  onNotesChange: (value: string) => void;
};

export function POHeaderDetails({
  po,
  isEditing,
  isPartiallyReceived,
  isDraft,
  suppliers,
  locations,
  editSupplierId,
  editDestinationId,
  editExpectedDate,
  editNotes,
  totalOrdered,
  totalReceived,
  totalRejected,
  totalRemaining,
  pctReceived,
  onSupplierChange,
  onDestinationChange,
  onExpectedDateChange,
  onNotesChange,
}: POHeaderDetailsProps) {
  return (
    <>
      {isEditing ? (
        <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/[0.02] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Header Details
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Supplier
              </label>
              <select
                value={editSupplierId}
                onChange={(event) => onSupplierChange(event.target.value)}
                disabled={isPartiallyReceived}
                className="h-8 w-full rounded-lg border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 disabled:opacity-50"
              >
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Destination
              </label>
              <select
                value={editDestinationId}
                onChange={(event) => onDestinationChange(event.target.value)}
                disabled={isPartiallyReceived}
                className="h-8 w-full rounded-lg border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 disabled:opacity-50"
              >
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Expected Delivery
              </label>
              <input
                type="date"
                value={editExpectedDate}
                onChange={(event) => onExpectedDateChange(event.target.value)}
                className="h-8 w-full rounded-lg border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Notes
              </label>
              <input
                type="text"
                value={editNotes}
                onChange={(event) => onNotesChange(event.target.value)}
                placeholder="Optional notes..."
                className="h-8 w-full rounded-lg border border-border bg-background px-2 text-[12px] outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
          <InfoChip
            label="Supplier"
            primary={po.supplier.name}
            secondary={po.supplier.contactPhone ?? po.supplier.contactEmail ?? undefined}
          />
          <svg
            className="h-5 w-5 shrink-0 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 8l4 4m0 0l-4 4m4-4H3"
            />
          </svg>
          <InfoChip
            label="Destination"
            primary={po.destination.name}
            secondary={po.destination.code}
          />
          {po.expectedDeliveryDate && (
            <InfoChip
              label="Expected Delivery"
              primary={new Date(po.expectedDeliveryDate).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric", year: "numeric" },
              )}
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TimelineCard label="Created" date={po.createdAt} />
        <TimelineCard label="Submitted" date={po.submittedAt} />
        <TimelineCard label="Closed" date={po.closedAt} />
        <TimelineCard label="Cancelled" date={po.cancelledAt} />
      </div>

      {!isDraft && (
        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">{totalOrdered} items ordered</span>
            <span className="text-muted-foreground">
              {totalReceived} received
              {totalRejected > 0 && ` \u00b7 ${totalRejected} rejected`}
              {totalRemaining > 0 && ` \u00b7 ${totalRemaining} remaining`}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-success transition-all duration-500"
              style={{ width: `${pctReceived}%` }}
            />
          </div>
          <div className="mt-1.5 text-[10px] text-muted-foreground">
            {pctReceived}% received
          </div>
        </div>
      )}
    </>
  );
}
