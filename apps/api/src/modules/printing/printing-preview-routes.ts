import type { FastifyInstance } from "fastify";
import { buildLabelaryUrl, toPngDataUrl } from "./printing-preview";

export async function registerPrintingPreviewRoutes(app: FastifyInstance) {
  app.post<{
    Body: {
      zpl: string;
      widthMm?: number;
      heightMm?: number;
      dpmm?: number;
    };
  }>(
    "/preview",
    {
      schema: {
        body: {
          type: "object",
          required: ["zpl"],
          properties: {
            zpl: { type: "string", minLength: 1, maxLength: 500_000 },
            widthMm: { type: "number" },
            heightMm: { type: "number" },
            dpmm: { type: "number" },
          },
        },
      },
    },
    async (request, reply) => {
      const { zpl, widthMm = 50, heightMm = 30, dpmm = 8 } = request.body;
      const url = buildLabelaryUrl(widthMm, heightMm, dpmm);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Accept: "image/png",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: zpl,
        });

        if (!response.ok) {
          return reply
            .status(502)
            .send({ error: `Labelary API error: ${response.status}` });
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        return { image: toPngDataUrl(buffer) };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return reply
          .status(502)
          .send({ error: `Preview generation failed: ${msg}` });
      }
    },
  );
}
