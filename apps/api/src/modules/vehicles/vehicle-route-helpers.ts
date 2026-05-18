import type { FastifyReply } from "fastify";

export const VEHICLE_MANAGER_ROLES = ["ADMIN", "MANAGER"];
export const VEHICLE_MANAGER_REQUIRED_ERROR = "Admin or Manager required";

export type VehicleListQuery = {
  search?: string;
  make?: string;
  limit?: string;
  cursor?: string;
};

export type VehicleDeleteQuery = {
  force?: string;
};

export type BulkApplyFitmentBody = {
  vehicleId: string;
  productIds: string[];
  notes?: string;
};

export type BulkRemoveFitmentBody = {
  vehicleId: string;
  productIds: string[];
};

export function canManageVehicles(role: string | undefined) {
  return VEHICLE_MANAGER_ROLES.includes(role ?? "");
}

export function sendVehicleManagerRequired(reply: FastifyReply) {
  return reply.status(403).send({ error: VEHICLE_MANAGER_REQUIRED_ERROR });
}

export function parseVehicleListOptions(query: VehicleListQuery) {
  return {
    search: query.search,
    make: query.make,
    limit: query.limit ? parseInt(query.limit, 10) : undefined,
    cursor: query.cursor,
  };
}
