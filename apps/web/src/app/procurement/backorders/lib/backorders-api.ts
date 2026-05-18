import type {
  BackorderItem,
  BackorderSummary,
  ProductSearchResult,
  SupplierGroup,
  SupplierOption,
} from "../types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

type ApiEnvelope<T> = {
  data?: T;
};

type PurchaseOrderResult = {
  id?: string;
  poNo?: string;
  data?: {
    id?: string;
    poNo?: string;
  };
};

type ResourceBackorderResult = {
  newPoNo?: string;
  newSupplierName?: string;
};

async function backordersApiFetch<T>(
  path: string,
  token: string,
  locationId: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Location-ID": locationId,
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function unwrapData<T>(response: ApiEnvelope<T> | T): T {
  if (
    response &&
    typeof response === "object" &&
    "data" in response &&
    response.data !== undefined
  ) {
    return response.data;
  }

  return response as T;
}

export function getBackordersErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message || fallback : fallback;
}

export function fetchBackorderSummary(token: string, locationId: string) {
  return backordersApiFetch<BackorderSummary>(
    "/procurement/backorders/summary",
    token,
    locationId,
  );
}

export async function fetchBackordersBySupplier(
  token: string,
  locationId: string,
): Promise<SupplierGroup[]> {
  const data = await backordersApiFetch<ApiEnvelope<SupplierGroup[]> | SupplierGroup[]>(
    "/procurement/backorders/by-supplier",
    token,
    locationId,
  );
  return unwrapData(data);
}

export async function fetchBackorders(
  token: string,
  locationId: string,
  status: string,
): Promise<BackorderItem[]> {
  const qs = status !== "ALL" ? `?status=${status}` : "";
  const data = await backordersApiFetch<ApiEnvelope<BackorderItem[]> | BackorderItem[]>(
    `/procurement/backorders${qs}`,
    token,
    locationId,
  );
  return unwrapData(data);
}

export async function fetchBackorderSuppliers(
  token: string,
  locationId: string,
): Promise<SupplierOption[]> {
  const data = await backordersApiFetch<ApiEnvelope<SupplierOption[]> | SupplierOption[]>(
    "/procurement/suppliers",
    token,
    locationId,
  );
  return unwrapData(data);
}

export async function searchBackorderProducts(
  token: string,
  locationId: string,
  query: string,
): Promise<ProductSearchResult[]> {
  const data = await backordersApiFetch<
    ApiEnvelope<ProductSearchResult[]> | ProductSearchResult[]
  >(`/products?search=${encodeURIComponent(query)}&limit=10`, token, locationId);
  return unwrapData(data);
}

export function createPurchaseOrderFromBackorders({
  locationId,
  pendingItems,
  supplierId,
  token,
}: {
  locationId: string;
  pendingItems: BackorderItem[];
  supplierId: string;
  token: string;
}) {
  return backordersApiFetch<PurchaseOrderResult>(
    "/procurement/purchase-orders",
    token,
    locationId,
    {
      method: "POST",
      body: JSON.stringify({
        supplierId,
        destinationLocationId: locationId,
        lines: pendingItems.map((item) => ({
          productId: item.productId,
          orderedQty: item.qtyNeeded,
          unitCost: "0.00",
        })),
        notes: `Created from backorders: ${pendingItems
          .map((item) => item.sourcePONumber)
          .filter(Boolean)
          .join(", ")}`,
      }),
    },
  );
}

export function includeBackordersInPurchaseOrder({
  backorderIds,
  locationId,
  targetPoId,
  targetPoNumber,
  token,
}: {
  backorderIds: string[];
  locationId: string;
  targetPoId: string | undefined;
  targetPoNumber: string;
  token: string;
}) {
  return backordersApiFetch("/procurement/backorders/include-in-po", token, locationId, {
    method: "POST",
    body: JSON.stringify({
      backorderIds,
      targetPoId,
      targetPoNumber,
    }),
  });
}

export function cancelBackorder({
  backorderId,
  locationId,
  reason,
  token,
}: {
  backorderId: string;
  locationId: string;
  reason: string;
  token: string;
}) {
  return backordersApiFetch(
    `/procurement/backorders/${backorderId}/cancel`,
    token,
    locationId,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
  );
}

export function createSingleBackorderPo({
  backorderId,
  locationId,
  token,
}: {
  backorderId: string;
  locationId: string;
  token: string;
}) {
  return backordersApiFetch<{ newPoNo?: string }>(
    `/procurement/backorders/${backorderId}/create-po`,
    token,
    locationId,
    { method: "POST" },
  );
}

export function resourceBackorder({
  backorderId,
  locationId,
  newSupplierId,
  token,
}: {
  backorderId: string;
  locationId: string;
  newSupplierId: string;
  token: string;
}) {
  return backordersApiFetch<ResourceBackorderResult>(
    `/procurement/backorders/${backorderId}/resource`,
    token,
    locationId,
    {
      method: "POST",
      body: JSON.stringify({ newSupplierId }),
    },
  );
}

export function updateBackorder({
  backorderId,
  locationId,
  neededBy,
  notes,
  priority,
  token,
}: {
  backorderId: string;
  locationId: string;
  neededBy: string | null;
  notes: string | null;
  priority: string;
  token: string;
}) {
  return backordersApiFetch(`/procurement/backorders/${backorderId}`, token, locationId, {
    method: "PATCH",
    body: JSON.stringify({
      priority,
      neededBy,
      notes,
    }),
  });
}

export function createBackorder({
  locationId,
  neededBy,
  priority,
  productId,
  qtyNeeded,
  reason,
  supplierId,
  token,
}: {
  locationId: string;
  neededBy: string | null;
  priority: string;
  productId: string;
  qtyNeeded: number;
  reason: string;
  supplierId: string;
  token: string;
}) {
  return backordersApiFetch("/procurement/backorders", token, locationId, {
    method: "POST",
    body: JSON.stringify({
      productId,
      supplierId,
      qtyNeeded,
      reason,
      priority,
      neededBy,
    }),
  });
}
