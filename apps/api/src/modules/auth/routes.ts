import type { FastifyPluginAsync } from "fastify";
import { registerSchema, loginSchema } from "@apex/types";
import { createOrganizationWithAdmin, authenticateUser, verifyPin } from "./service";
import { getUserPermissions } from "../rbac/service";

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/register", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    try {
      const { org, user } = await createOrganizationWithAdmin(parsed.data);
      const token = app.jwt.sign(
        {
          userId: user.id,
          orgId: org.id,
          role: user.role,
          primaryLocationId: user.primaryLocationId ?? "",
        },
        { expiresIn: "24h" },
      );

      return reply.status(201).send({
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
        organization: { id: org.id, name: org.name, slug: org.slug },
      });
    } catch (err: any) {
      if (err.message === "Email already registered") {
        return reply.status(409).send({ error: err.message });
      }
      throw err;
    }
  });

  // Verify a manager/admin PIN (authenticated route — JWT required)
  app.post("/verify-pin", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { pin } = request.body as { pin?: string };
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return reply.status(400).send({ error: "PIN must be exactly 4 digits" });
    }

    const result = await verifyPin(request.user.orgId, pin);
    return reply.send(result);
  });

  app.post("/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    try {
      const user = await authenticateUser(parsed.data.email, parsed.data.password);
      // Fetch RBAC permissions for the user
      const permissions = await getUserPermissions(user.id, user.role);
      const token = app.jwt.sign(
        {
          userId: user.id,
          orgId: user.orgId,
          role: user.role,
          primaryLocationId: user.primaryLocationId ?? "",
          permissions,
        },
        { expiresIn: "24h" },
      );

      return reply.send({
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          permissions,
        },
      });
    } catch {
      return reply.status(401).send({ error: "Invalid email or password" });
    }
  });
};
