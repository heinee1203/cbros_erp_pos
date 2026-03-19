"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Tag,
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Zap,
  Hash,
  Car,
  FileCode,
  Layers,
  Download,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

/* ─── Types ─── */
interface TagRow {
  id: string;
  name: string;
  tagType: string;
  description: string | null;
  productCount: number;
  totalSales90d: number;
}

type TagType = "ALL" | "TIRE_SIZE" | "VEHICLE" | "APPLICATION_CODE" | "CUSTOM";

const TAG_TYPES: { key: TagType; label: string; icon: any }[] = [
  { key: "ALL", label: "All Tags", icon: Layers },
  { key: "TIRE_SIZE", label: "Tire Sizes", icon: Hash },
  { key: "VEHICLE", label: "Vehicle Fitment", icon: Car },
  { key: "APPLICATION_CODE", label: "Application Codes", icon: FileCode },
  { key: "CUSTOM", label: "Custom", icon: Tag },
];

const TAG_TYPE_BADGE: Record<string, string> = {
  TIRE_SIZE: "bg-blue-50 text-blue-700",
  VEHICLE: "bg-green-50 text-green-700",
  APPLICATION_CODE: "bg-purple-50 text-purple-700",
  CUSTOM: "bg-gray-100 text-gray-700",
};

function fmt(v: number) {
  return v.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

/* ─── Hooks ─── */
function useTags(token: string | null, locationId: string | null, tagType?: string, search?: string) {
  return useQuery({
    queryKey: ["tags", tagType, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (tagType && tagType !== "ALL") params.set("tagType", tagType);
      if (search) params.set("search", search);
      const qs = params.toString();
      return apiFetch<{ data: TagRow[] }>(`/tags${qs ? `?${qs}` : ""}`, { token: token!, locationId: locationId ?? undefined });
    },
    enabled: !!token,
  });
}

/* ─── Page ─── */
export default function TagManagementPage() {
  const { token, locationId } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TagType>("ALL");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search
  const searchTimeout = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = useCallback(
    (val: string) => {
      setSearch(val);
      if (searchTimeout[0]) clearTimeout(searchTimeout[0]);
      searchTimeout[0] = setTimeout(() => setDebouncedSearch(val), 300);
    },
    [searchTimeout],
  );

  const tagsQuery = useTags(token, locationId, activeTab, debouncedSearch);
  const tags = tagsQuery.data?.data ?? [];

  // ── New Tag Modal ──
  const [showNewTag, setShowNewTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagType, setNewTagType] = useState<string>("CUSTOM");
  const [newTagDesc, setNewTagDesc] = useState("");
  const [formError, setFormError] = useState("");

  // ── Edit Tag Modal ──
  const [editingTag, setEditingTag] = useState<TagRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // ── Delete Confirm ──
  const [deleteTarget, setDeleteTarget] = useState<TagRow | null>(null);

  // ── Expanded products ──
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Bulk auto-tag result ──
  const [autoTagResult, setAutoTagResult] = useState<string | null>(null);

  // ── Bulk tag by search ──
  const [showBulkTag, setShowBulkTag] = useState(false);
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkTagId, setBulkTagId] = useState("");
  const [bulkNewTagName, setBulkNewTagName] = useState("");

  // Mutations
  const createTagMut = useMutation({
    mutationFn: (body: { name: string; tagType: string; description?: string }) =>
      apiFetch<{ data: TagRow }>("/tags", {
        method: "POST",
        token: token!,
        locationId: locationId ?? undefined,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      setShowNewTag(false);
      setNewTagName("");
      setNewTagType("CUSTOM");
      setNewTagDesc("");
      setFormError("");
    },
    onError: (err: any) => setFormError(err.message ?? "Failed to create tag"),
  });

  const updateTagMut = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; description?: string }) =>
      apiFetch(`/tags/${id}`, {
        method: "PATCH",
        token: token!,
        locationId: locationId ?? undefined,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      setEditingTag(null);
    },
  });

  const deleteTagMut = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/tags/${id}`, { method: "DELETE", token: token!, locationId: locationId ?? undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      setDeleteTarget(null);
    },
  });

  const autoTagTiresMut = useMutation({
    mutationFn: () =>
      apiFetch<{ data: { tagged: number } }>("/tags/auto-tag-tires", {
        method: "POST",
        token: token!,
        locationId: locationId ?? undefined,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      setAutoTagResult(`Auto-tagged ${result.data.tagged} tire products.`);
      setTimeout(() => setAutoTagResult(null), 5000);
    },
    onError: (err: any) => {
      setAutoTagResult(`Error: ${err.message}`);
      setTimeout(() => setAutoTagResult(null), 5000);
    },
  });

  const bulkTagMut = useMutation({
    mutationFn: (body: { search: string; tagId?: string; tagName?: string; tagType?: string }) =>
      apiFetch<{ data: { tagged: number } }>("/tags/bulk-tag", {
        method: "POST",
        token: token!,
        locationId: locationId ?? undefined,
        body: JSON.stringify(body),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      setShowBulkTag(false);
      setBulkSearch("");
      setBulkTagId("");
      setBulkNewTagName("");
      setAutoTagResult(`Bulk tagged ${result.data.tagged} products.`);
      setTimeout(() => setAutoTagResult(null), 5000);
    },
  });

  const handleCreateTag = () => {
    const name = newTagName.trim();
    if (!name) {
      setFormError("Name is required");
      return;
    }
    createTagMut.mutate({ name, tagType: newTagType, description: newTagDesc.trim() || undefined });
  };

  const handleUpdateTag = () => {
    if (!editingTag) return;
    updateTagMut.mutate({ id: editingTag.id, name: editName.trim(), description: editDesc.trim() || undefined });
  };

  const handleBulkTag = () => {
    if (!bulkSearch.trim()) return;
    const body: any = { search: bulkSearch.trim() };
    if (bulkTagId) body.tagId = bulkTagId;
    else if (bulkNewTagName.trim()) {
      body.tagName = bulkNewTagName.trim();
      body.tagType = "CUSTOM";
    }
    bulkTagMut.mutate(body);
  };

  const isLoading = tagsQuery.isLoading;

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <Tag size={16} className="text-primary" />
          </div>
          <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Tags / Fitment</h1>
        </div>
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
          Manage product tags for tire sizes, vehicle fitment, application codes, and custom groupings.
        </p>

        {/* Summary */}
        <div className="mt-4 flex gap-5">
          <div className="flex items-center gap-2 text-[13px]">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-muted">
              <Tag size={11} className="text-muted-foreground" />
            </div>
            <span className="text-muted-foreground">Total Tags</span>
            <span className="font-semibold tabular-nums text-foreground">{tags.length}</span>
          </div>
        </div>
      </div>

      {/* Auto-tag result banner */}
      {autoTagResult && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.04] px-4 py-2 text-[13px] text-foreground">
          <Zap size={14} className="text-primary" />
          {autoTagResult}
          <button onClick={() => setAutoTagResult(null)} className="ml-auto text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Tabs + Search + Actions */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TAG_TYPES.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 h-8 rounded-lg border px-3 text-[11px] font-medium transition-colors",
                activeTab === t.key
                  ? "border-primary/20 bg-primary/[0.04] text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon size={12} />
              {t.label}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          {activeTab === "TIRE_SIZE" && (
            <button
              onClick={() => autoTagTiresMut.mutate()}
              disabled={autoTagTiresMut.isPending}
              className="flex items-center gap-1.5 h-8 rounded-lg bg-blue-600 px-3 text-[11px] font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {autoTagTiresMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
              Auto-Tag Tires
            </button>
          )}
          <button
            onClick={() => setShowBulkTag(true)}
            className="flex items-center gap-1.5 h-8 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Layers size={12} />
            Bulk Tag by Search
          </button>
          <button
            onClick={() => setShowNewTag(true)}
            className="flex items-center gap-1.5 h-8 rounded-lg bg-primary px-3 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus size={12} />
            New Tag
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search tags..."
          className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
        />
        {search && (
          <button onClick={() => { setSearch(""); setDebouncedSearch(""); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
          <div className="w-8 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground" />
          <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Tag Name</div>
          <div className="w-32 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Type</div>
          <div className="w-24 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Products</div>
          <div className="w-32 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Sales 90d</div>
          <div className="w-24 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Actions</div>
        </div>

        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-11 animate-pulse border-b border-border bg-muted/20" />
            ))}
          </div>
        ) : tags.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Tag size={16} className="text-muted-foreground" />
            </div>
            <p className="mt-3 text-[13px] font-medium text-foreground">No tags found</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {search ? "Try a different search term" : "Create your first tag to get started"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tags.map((tag) => (
              <div key={tag.id}>
                <div className="flex items-center px-4 py-2.5 transition-colors hover:bg-accent/40">
                  <div className="w-8">
                    <button
                      onClick={() => setExpandedId(expandedId === tag.id ? null : tag.id)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {expandedId === tag.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-medium text-foreground">{tag.name}</span>
                    {tag.description && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">{tag.description}</p>
                    )}
                  </div>
                  <div className="w-32">
                    <span
                      className={cn(
                        "inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                        TAG_TYPE_BADGE[tag.tagType] ?? "bg-gray-100 text-gray-700",
                      )}
                    >
                      {tag.tagType.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="w-24 text-right text-[12px] tabular-nums text-foreground">{tag.productCount}</div>
                  <div className="w-32 text-right text-[12px] tabular-nums font-medium text-foreground">
                    PHP {fmt(tag.totalSales90d ?? 0)}
                  </div>
                  <div className="w-24 flex items-center justify-end gap-1">
                    <button
                      onClick={() => {
                        setEditingTag(tag);
                        setEditName(tag.name);
                        setEditDesc(tag.description ?? "");
                      }}
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(tag)}
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Expanded products section */}
                {expandedId === tag.id && (
                  <TagProductsList tagId={tag.id} token={token!} locationId={locationId!} />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">{tags.length} tags</span>
        </div>
      </div>

      {/* ── New Tag Modal ── */}
      {showNewTag && (
        <ModalOverlay onClose={() => setShowNewTag(false)}>
          <div className="w-[420px] rounded-xl border border-border bg-background p-5 shadow-xl">
            <h3 className="text-[15px] font-semibold text-foreground">New Tag</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Name</label>
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="e.g., 175/65R14"
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Type</label>
                <select
                  value={newTagType}
                  onChange={(e) => setNewTagType(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-primary/40"
                >
                  <option value="TIRE_SIZE">Tire Size</option>
                  <option value="VEHICLE">Vehicle Fitment</option>
                  <option value="APPLICATION_CODE">Application Code</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Description (optional)</label>
                <input
                  type="text"
                  value={newTagDesc}
                  onChange={(e) => setNewTagDesc(e.target.value)}
                  placeholder="Optional description..."
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
                />
              </div>
              {formError && <p className="text-[12px] text-destructive">{formError}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowNewTag(false)}
                className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTag}
                disabled={createTagMut.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {createTagMut.isPending && <Loader2 size={13} className="animate-spin" />}
                Create Tag
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Edit Tag Modal ── */}
      {editingTag && (
        <ModalOverlay onClose={() => setEditingTag(null)}>
          <div className="w-[420px] rounded-xl border border-border bg-background p-5 shadow-xl">
            <h3 className="text-[15px] font-semibold text-foreground">Edit Tag</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Description</label>
                <input
                  type="text"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setEditingTag(null)}
                className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateTag}
                disabled={updateTagMut.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {updateTagMut.isPending && <Loader2 size={13} className="animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteTarget && (
        <ModalOverlay onClose={() => setDeleteTarget(null)}>
          <div className="w-[380px] rounded-xl border border-border bg-background p-5 shadow-xl">
            <h3 className="text-[15px] font-semibold text-foreground">Delete Tag</h3>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Are you sure you want to delete <strong className="text-foreground">{deleteTarget.name}</strong>?
              This will remove the tag from {deleteTarget.productCount} products.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteTagMut.mutate(deleteTarget.id)}
                disabled={deleteTagMut.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-destructive px-4 py-2 text-[13px] font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleteTagMut.isPending && <Loader2 size={13} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Bulk Tag by Search Modal ── */}
      {showBulkTag && (
        <ModalOverlay onClose={() => setShowBulkTag(false)}>
          <div className="w-[480px] rounded-xl border border-border bg-background p-5 shadow-xl">
            <h3 className="text-[15px] font-semibold text-foreground">Bulk Tag by Search</h3>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Search for products by name/SKU, then apply a tag to all matches.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Product Search Term</label>
                <input
                  type="text"
                  value={bulkSearch}
                  onChange={(e) => setBulkSearch(e.target.value)}
                  placeholder="e.g., 175/65R14 or Toyota"
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Select Existing Tag</label>
                <select
                  value={bulkTagId}
                  onChange={(e) => { setBulkTagId(e.target.value); if (e.target.value) setBulkNewTagName(""); }}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-primary/40"
                >
                  <option value="">-- Select or create new below --</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.tagType.replace(/_/g, " ")})
                    </option>
                  ))}
                </select>
              </div>
              {!bulkTagId && (
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Or Create New Tag</label>
                  <input
                    type="text"
                    value={bulkNewTagName}
                    onChange={(e) => setBulkNewTagName(e.target.value)}
                    placeholder="New tag name..."
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
                  />
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowBulkTag(false)}
                className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkTag}
                disabled={bulkTagMut.isPending || (!bulkSearch.trim()) || (!bulkTagId && !bulkNewTagName.trim())}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {bulkTagMut.isPending && <Loader2 size={13} className="animate-spin" />}
                Apply Tag
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

/* ─── Tag Products List (expandable) ─── */
function TagProductsList({ tagId, token, locationId }: { tagId: string; token: string; locationId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tag-products", tagId],
    queryFn: () =>
      apiFetch<{ data: Array<{ id: string; name: string; sku: string; unitPrice: string }> }>(
        `/tags/${tagId}/products`,
        { token, locationId },
      ),
  });

  const products = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="border-t border-border bg-muted/10 px-8 py-3">
        <div className="h-6 w-48 animate-pulse rounded bg-muted/40" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="border-t border-border bg-muted/10 px-8 py-3 text-[12px] text-muted-foreground">
        No products with this tag.
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-muted/10 px-8 py-2">
      <div className="divide-y divide-border/50">
        {products.slice(0, 20).map((p) => (
          <div key={p.id} className="flex items-center gap-3 py-1.5">
            <span className="text-[12px] font-medium text-foreground truncate flex-1">{p.name}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{p.sku}</span>
            <span className="text-[12px] tabular-nums text-foreground">PHP {parseFloat(p.unitPrice).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span>
          </div>
        ))}
        {products.length > 20 && (
          <div className="py-1.5 text-[11px] text-muted-foreground">
            ... and {products.length - 20} more products
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Modal Overlay ─── */
function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
