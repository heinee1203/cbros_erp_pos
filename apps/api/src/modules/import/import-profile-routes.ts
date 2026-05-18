import type { FastifyInstance, FastifyReply } from "fastify";
import {
  createImportProfile,
  deleteImportProfile,
  listImportProfiles,
  updateImportProfile,
  type ImportProfileInput,
} from "./import-profile-service";
import { MANAGE_ROLES } from "./route-permissions";

export function registerImportProfileRoutes(app: FastifyInstance) {
  app.get("/profiles", async (request, reply) => {
    const orgId = request.user.orgId;
    const query = request.query as { importType?: string };
    const profiles = await listImportProfiles(orgId, query.importType ?? "items");
    return reply.send({ data: profiles });
  });

  app.post(
    "/profiles",
    {
      schema: {
        body: profileBodySchema(true),
      },
    },
    async (request, reply) => {
      if (!MANAGE_ROLES.includes(request.user.role)) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }

      try {
        const profile = await createImportProfile(
          request.user.orgId,
          request.user.userId,
          request.body as ImportProfileInput,
        );
        return reply.status(201).send({ data: profile });
      } catch (error) {
        return sendProfileError(reply, error);
      }
    },
  );

  app.patch(
    "/profiles/:profileId",
    {
      schema: {
        params: {
          type: "object",
          required: ["profileId"],
          properties: {
            profileId: { type: "string" },
          },
        },
        body: profileBodySchema(false),
      },
    },
    async (request, reply) => {
      if (!MANAGE_ROLES.includes(request.user.role)) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }

      const { profileId } = request.params as { profileId: string };
      try {
        const profile = await updateImportProfile(
          request.user.orgId,
          request.user.userId,
          profileId,
          request.body as ImportProfileInput,
        );
        if (!profile) {
          return reply.status(404).send({ error: "Import profile not found" });
        }
        return reply.send({ data: profile });
      } catch (error) {
        return sendProfileError(reply, error);
      }
    },
  );

  app.delete(
    "/profiles/:profileId",
    {
      schema: {
        params: {
          type: "object",
          required: ["profileId"],
          properties: {
            profileId: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      if (!MANAGE_ROLES.includes(request.user.role)) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }

      const { profileId } = request.params as { profileId: string };
      const deleted = await deleteImportProfile(request.user.orgId, profileId);
      if (!deleted) {
        return reply.status(404).send({ error: "Import profile not found" });
      }
      return reply.status(204).send();
    },
  );
}

function profileBodySchema(requireName: boolean) {
  const schema: Record<string, unknown> = {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      importType: { type: "string", enum: ["items"] },
      importMode: {
        type: "string",
        enum: ["smart_sync", "create_only", "update_only", "inventory_sync"],
      },
      locationMapping: {
        type: "object",
        additionalProperties: { type: "string" },
      },
      categoryMapping: {
        type: "object",
        additionalProperties: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["create", "map", "skip"] },
            targetCategoryId: { type: "string" },
            targetSubcategoryId: { type: "string" },
            familyId: { type: "string" },
            createSubcategory: { type: "boolean" },
          },
        },
      },
      includeCreates: { type: "boolean" },
      includeUpdates: { type: "boolean" },
      includeNoChange: { type: "boolean" },
      createNewCategories: { type: "boolean" },
      fieldLockPolicyVersion: { type: "string", maxLength: 80 },
    },
  };
  if (requireName) {
    schema.required = ["name"];
  }
  return schema;
}

function sendProfileError(reply: FastifyReply, error: unknown) {
  const code = typeof error === "object" && error !== null ? (error as { code?: string }).code : "";
  if (code === "23505") {
    return reply.status(409).send({ error: "An import profile with that name already exists" });
  }

  const message = error instanceof Error ? error.message : "Import profile request failed";
  return reply.status(400).send({ error: message });
}
