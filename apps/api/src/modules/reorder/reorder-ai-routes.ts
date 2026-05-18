import type { FastifyInstance } from "fastify";
import {
  buildSystemPrompt,
  buildUserPrompt,
  callClaudeAPI,
  checkRateLimit,
  gatherItemContext,
  recordUsage,
} from "./reorder-ai-advisor-service";

export async function registerReorderAiRoutes(app: FastifyInstance) {
  // POST /ai-analyze - AI-assisted ordering analysis
  app.post("/ai-analyze", async (request, reply) => {
    const role = (request.user as any)?.role;
    if (role !== "ADMIN" && role !== "MANAGER") {
      return reply.status(403).send({ error: "Admin or Manager role required" });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return reply.status(503).send({ error: "AI advisor not configured. Set ANTHROPIC_API_KEY." });
    }

    const { orgId } = request.storeContext!;
    const body = request.body as {
      productIds: string[];
      question?: string;
      mode?: "single" | "multi" | "budget";
      budget?: number;
      conversationHistory?: Array<{ role: string; content: string }>;
    };

    if (!body.productIds?.length || body.productIds.length > 20) {
      return reply.status(400).send({ error: "Provide 1-20 product IDs" });
    }

    const rateCheck = checkRateLimit(orgId);
    if (!rateCheck.allowed) {
      return reply.status(429).send({
        error: `AI analysis limit reached (20/hour). Resets in ${rateCheck.resetMinutes} minutes.`,
        remaining: 0,
        resetMinutes: rateCheck.resetMinutes,
      });
    }

    const items = await gatherItemContext(orgId, body.productIds);
    if (items.length === 0) {
      return reply.status(404).send({ error: "No products found" });
    }

    const mode = body.mode ?? (items.length > 1 ? "multi" : "single");
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(items, body.question, mode, body.budget);

    const messages: Array<{ role: string; content: string }> = [];
    if (body.conversationHistory?.length) {
      messages.push(...body.conversationHistory);
      messages.push({ role: "user", content: body.question || "Continue the analysis." });
    } else {
      messages.push({ role: "user", content: userPrompt });
    }

    try {
      const result = await callClaudeAPI(systemPrompt, messages, items.length);
      recordUsage(orgId);

      return reply.send({
        analysis: result.analysis,
        generatedAt: new Date().toISOString(),
        model: result.model,
        itemCount: items.length,
        tokensUsed: result.tokensUsed,
        remaining: rateCheck.remaining - 1,
      });
    } catch (err: any) {
      if (err.status === 529 || err.message?.includes("overloaded")) {
        return reply.status(503).send({ error: "AI service temporarily unavailable. Please try again in a moment." });
      }
      request.log.error(err, "AI analysis failed");
      return reply.status(500).send({ error: "AI analysis failed: " + (err.message || "Unknown error") });
    }
  });

  // GET /ai-usage - rate limit status
  app.get("/ai-usage", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const rateCheck = checkRateLimit(orgId);
    return reply.send({
      used: 20 - rateCheck.remaining,
      limit: 20,
      remaining: rateCheck.remaining,
      resetMinutes: rateCheck.resetMinutes,
    });
  });
}
