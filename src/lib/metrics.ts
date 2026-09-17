import client from "@prometheus-io/client";

export const register = new client.Registry();
client.collectDefaultMetrics({ register }); // CPU, memory, event loop lag, etc.

// measure how long the HTTP request took and bucket the durations into ranges
export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
});
register.registerMetric(httpRequestDuration);
