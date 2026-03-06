export const LocationType = {
  WAREHOUSE: "WAREHOUSE",
  RETAIL_STORE: "RETAIL_STORE",
} as const;
export type LocationType = (typeof LocationType)[keyof typeof LocationType];

export const UserRole = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  CASHIER: "CASHIER",
  WAREHOUSE_STAFF: "WAREHOUSE_STAFF",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ProductCategory = {
  TIRES: "TIRES",
  LUBRICANTS: "LUBRICANTS",
  HARD_PARTS: "HARD_PARTS",
  ACCESSORIES: "ACCESSORIES",
  LABOR_SERVICES: "LABOR_SERVICES",
} as const;
export type ProductCategory =
  (typeof ProductCategory)[keyof typeof ProductCategory];

export const TransferStatus = {
  DRAFT: "DRAFT",
  PENDING: "PENDING",
  IN_TRANSIT: "IN_TRANSIT",
  RECEIVED: "RECEIVED",
  CANCELLED: "CANCELLED",
} as const;
export type TransferStatus =
  (typeof TransferStatus)[keyof typeof TransferStatus];
