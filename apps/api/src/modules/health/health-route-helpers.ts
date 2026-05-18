export function buildHealthOkResponse() {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    database: "connected",
  };
}

export function buildHealthErrorResponse() {
  return {
    status: "error",
    timestamp: new Date().toISOString(),
    database: "disconnected",
  };
}
