import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { STATUS_LABELS } from "../constants";
import type { BackordersPageController } from "../lib/use-backorders-page-controller";
import { BackorderRow } from "./backorder-row";
import { EmptyState } from "./empty-state";
import { SupplierGroupSection } from "./supplier-group-section";

type BackordersContentProps = {
  controller: BackordersPageController;
};

export function BackordersContent({ controller }: BackordersContentProps) {
  return (
    <div className="flex-1 overflow-auto">
      {controller.loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : controller.isGroupedView ? (
        <BackordersGroupedView controller={controller} />
      ) : (
        <BackordersFlatView controller={controller} />
      )}
    </div>
  );
}

function BackordersGroupedView({ controller }: BackordersContentProps) {
  if (controller.filteredSupplierGroups.length === 0) {
    return (
      <EmptyState
        message={controller.searchQuery ? "No backorders match your search" : "No pending backorders"}
        submessage={
          controller.searchQuery
            ? "Try broadening your search criteria."
            : 'All caught up! Click "+ New Backorder" to add one manually.'
        }
      />
    );
  }

  return (
    <div className="divide-y divide-gray-200">
      {controller.filteredSupplierGroups.map((group) => (
        <SupplierGroupSection
          key={group.supplierId}
          group={group}
          isExpanded={controller.expandedSuppliers.has(group.supplierId)}
          onToggle={() => controller.toggleSupplierExpand(group.supplierId)}
          onCreatePO={() => controller.handleCreatePO(group.supplierId, group.supplierName)}
          isCreatingPO={controller.creatingPO === group.supplierId}
          onEdit={controller.openEditModal}
          onCancel={controller.openCancelModal}
          onCreatePOSingle={controller.handleCreatePOSingle}
          onResourceItem={controller.openResourceModal}
        />
      ))}
    </div>
  );
}

function BackordersFlatView({ controller }: BackordersContentProps) {
  if (controller.filteredFlatItems.length === 0) {
    return (
      <EmptyState
        message={
          controller.searchQuery
            ? "No backorders match your search"
            : `No ${controller.activeTab === "ALL" ? "" : STATUS_LABELS[controller.activeTab]?.toLowerCase() + " "}backorders`
        }
        submessage={
          controller.searchQuery
            ? "Try broadening your search criteria."
            : 'Click "+ New Backorder" to create one.'
        }
      />
    );
  }

  return (
    <table className="w-full text-left text-sm">
      <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
        <tr>
          <BackordersTableHeader>Product</BackordersTableHeader>
          <BackordersTableHeader>Supplier</BackordersTableHeader>
          <BackordersTableHeader align="right">Qty</BackordersTableHeader>
          <BackordersTableHeader>Source PO</BackordersTableHeader>
          <BackordersTableHeader align="right">Days Pending</BackordersTableHeader>
          <BackordersTableHeader>Reason</BackordersTableHeader>
          <BackordersTableHeader align="center">Priority</BackordersTableHeader>
          <BackordersTableHeader align="center">Status</BackordersTableHeader>
          <BackordersTableHeader>Needed By</BackordersTableHeader>
          <BackordersTableHeader align="center">Actions</BackordersTableHeader>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        {controller.filteredFlatItems.map((item) => (
          <BackorderRow
            key={item.id}
            item={item}
            onEdit={() => controller.openEditModal(item)}
            onCancel={() => controller.openCancelModal(item)}
            onCreatePO={() => controller.handleCreatePOSingle(item.id, item.productName)}
            onResource={() => controller.openResourceModal(item)}
          />
        ))}
      </tbody>
    </table>
  );
}

function BackordersTableHeader({
  align,
  children,
}: {
  align?: "left" | "right" | "center";
  children: ReactNode;
}) {
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "";

  return (
    <th
      scope="col"
      className={`whitespace-nowrap px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${alignClass}`}
    >
      {children}
    </th>
  );
}
