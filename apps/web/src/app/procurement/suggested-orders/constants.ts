export const PRIORITY_CONFIG: Record<string, { label: string; badge: string }> = {
  CRITICAL: { label: "Critical", badge: "bg-red-100 text-red-700" },
  URGENT: { label: "Urgent", badge: "bg-orange-100 text-orange-700" },
  NORMAL: { label: "Normal", badge: "bg-yellow-100 text-yellow-700" },
};

export const ABC_CONFIG: Record<string, { badge: string }> = {
  A: { badge: "bg-emerald-100 text-emerald-700" },
  B: { badge: "bg-blue-100 text-blue-700" },
  C: { badge: "bg-gray-100 text-gray-600" },
};

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
