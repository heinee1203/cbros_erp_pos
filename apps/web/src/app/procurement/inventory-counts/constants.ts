export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  REVIEWED: "Reviewed",
  POSTED: "Posted",
  CANCELLED: "Cancelled",
};

export const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  IN_PROGRESS: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  COMPLETED: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  REVIEWED: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  POSTED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  CANCELLED: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

export const SCOPE_LABELS: Record<string, string> = {
  FULL_LOCATION: "Full Location",
  CATEGORY: "Category",
  FAMILY: "Group",
  SELECTED_SKUS: "Selected SKUs",
};

export const ALL_STATUSES = Object.keys(STATUS_LABELS);
