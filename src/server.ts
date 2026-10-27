import { Hono } from "hono";
import type { Config } from "./config.ts";
import { adminRoutes } from "./routes/admin.ts";
import { dashboardRoutes } from "./routes/dashboard.ts";
import { jobRoutes } from "./routes/jobs.ts";
import { webhookRoutes } from "./routes/webhooks.ts";

export function createApp(cfg: Config): Hono {
  const app = new Hono();
  app.route("/webhooks", webhookRoutes(cfg));
  app.route("/jobs", jobRoutes());
  app.route("/", adminRoutes(cfg));
  app.route("/", dashboardRoutes());
  return app;
}
