import type { FastifyPluginAsync } from "fastify";
import { registerSchema, loginSchema } from "@apex/types";
import { createOrganizationWithAdmin, authenticateUser } from "./service";

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/register", async (request, reply) => {
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

  app.post("/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    try {
      const user = await authenticateUser(parsed.data.email, parsed.data.password);
      const token = app.jwt.sign(
        {
          userId: user.id,
          orgId: user.orgId,
          role: user.role,
          primaryLocationId: user.primaryLocationId ?? "",
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
        },
      });
    } catch {
      return reply.status(401).send({ error: "Invalid email or password" });
    }
  });
};
