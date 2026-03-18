"use client";

import { useState, useCallback } from "react";
import { X, Sparkles, Send, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AiAdvisorPanelProps {
  open: boolean;
  onClose: () => void;
  productIds: string[];
  productNames: string[];  // For header display
  mode?: "single" | "multi" | "budget";
}

export function AiAdvisorPanel({ open, onClose, productIds, productNames, mode: initialMode }: AiAdvisorPanelProps) {
  const { token, locationId } = useAuth();
  const [analysis, setAnalysis] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  const [budget, setBudget] = useState("");
  const [followUpCount, setFollowUpCount] = useState(0);

  const mode = initialMode ?? (productIds.length > 1 ? "multi" : "single");

  const analyze = useCallback(async (question?: string, history?: typeof conversationHistory) => {
    setLoading(true);
    setError("");
    try {
      const resp = await apiFetch<{
        analysis: string;
        remaining: number;
        tokensUsed: number;
      }>("/inventory/reorder/ai-analyze", {
        method: "POST",
        token: token!,
        locationId,
        body: JSON.stringify({
          productIds,
          question: question || undefined,
          mode: budget ? "budget" : mode,
          budget: budget ? parseFloat(budget) : undefined,
          conversationHistory: history || undefined,
        }),
      });
      setAnalysis(resp.analysis);
      setRemaining(resp.remaining);

      // Build conversation history for follow-ups
      if (!history) {
        setConversationHistory([
          { role: "user", content: question || "Analyze these items" },
          { role: "assistant", content: resp.analysis },
        ]);
      } else {
        setConversationHistory([
          ...history,
          { role: "user", content: question || "" },
          { role: "assistant", content: resp.analysis },
        ]);
      }
    } catch (err: any) {
      setError(err.message || "AI analysis failed");
    } finally {
      setLoading(false);
    }
  }, [token, locationId, productIds, mode, budget]);

  // Auto-analyze on open
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  if (open && !hasAnalyzed && !loading && !analysis) {
    setHasAnalyzed(true);
    analyze();
  }

  // Reset when panel closes
  if (!open && hasAnalyzed) {
    // Will reset on next open via the effect above
  }

  const handleFollowUp = () => {
    if (!followUp.trim() || followUpCount >= 5) return;
    setFollowUpCount(c => c + 1);
    analyze(followUp, conversationHistory);
    setFollowUp("");
  };

  if (!open) return null;

  return (
    // Backdrop
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-background shadow-xl flex flex-col h-full animate-in slide-in-from-right">
        {/* Header */}
        <div className="border-b px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-amber-500" />
            <h2 className="font-semibold text-sm">AI Inventory Advisor</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Item info */}
        <div className="border-b px-5 py-3 bg-muted/30">
          <div className="text-sm font-medium truncate">
            {productNames.length === 1 ? productNames[0] : `${productNames.length} items selected`}
          </div>
          {productIds.length > 1 && mode !== "budget" && (
            <div className="text-xs text-muted-foreground mt-1">Comparative analysis</div>
          )}
          {(productIds.length > 1) && (
            <div className="mt-2 flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Budget (optional):</label>
              <div className="flex items-center">
                <span className="text-xs text-muted-foreground mr-1">P</span>
                <input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="e.g., 50000"
                  className="w-28 rounded border border-border px-2 py-1 text-xs"
                />
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && !analysis && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 size={24} className="animate-spin mb-3" />
              <p className="text-sm">Analyzing...</p>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {analysis && (
            <div className="prose prose-sm max-w-none text-[13px] leading-relaxed">
              {/* Simple markdown rendering - bold, headers, bullets */}
              {analysis.split("\n").map((line, i) => {
                if (line.startsWith("### ")) return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>;
                if (line.startsWith("## ")) return <h3 key={i} className="font-semibold text-base mt-4 mb-1">{line.slice(3)}</h3>;
                if (line.startsWith("# ")) return <h2 key={i} className="font-bold text-base mt-4 mb-2">{line.slice(2)}</h2>;
                if (line.startsWith("- ") || line.startsWith("* ")) return <li key={i} className="ml-4 list-disc">{renderBold(line.slice(2))}</li>;
                if (line.trim() === "") return <br key={i} />;
                return <p key={i} className="mb-1">{renderBold(line)}</p>;
              })}
            </div>
          )}

          {loading && analysis && (
            <div className="flex items-center gap-2 mt-4 text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-xs">Thinking...</span>
            </div>
          )}
        </div>

        {/* Raw data toggle */}
        {analysis && (
          <div className="border-t px-5 py-2">
            <button
              onClick={() => setShowRawData(!showRawData)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {showRawData ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              View Raw Data
            </button>
          </div>
        )}

        {/* Follow-up input */}
        {analysis && !loading && followUpCount < 5 && (
          <div className="border-t px-5 py-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFollowUp()}
                placeholder="Ask a follow-up..."
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm"
              />
              <button
                onClick={handleFollowUp}
                disabled={!followUp.trim()}
                className="rounded-lg bg-primary px-3 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Usage footer */}
        <div className="border-t px-5 py-2 text-[10px] text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Sparkles size={10} />
            {remaining !== null ? `${20 - remaining}/20 AI requests used this hour` : ""}
          </span>
          {followUpCount > 0 && <span>{followUpCount}/5 follow-ups</span>}
        </div>
      </div>
    </div>
  );
}

// Simple bold text renderer
function renderBold(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part);
}
