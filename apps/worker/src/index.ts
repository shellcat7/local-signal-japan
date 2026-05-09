import { Hono } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createMockAreaSignalConnector, describeServerOnlyConnectorPolicy } from "@local-signal-japan/connectors";
import { findAreaSignal, listAreaOptions } from "@local-signal-japan/core";
import { generateMarkdownReport } from "@local-signal-japan/reporting";

const areaCodeParamSchema = z.object({
  areaCode: z.string().regex(/^\d{5}$/)
});

const app = new Hono();
const connector = createMockAreaSignalConnector();

app.use(
  "/api/*",
  cors({
    origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
    allowMethods: ["GET"]
  })
);

app.get("/", (c) => {
  return c.json({
    name: "Local Signal Japan API",
    mode: connector.mode,
    dataPolicy: "mock data only in MVP",
    routes: ["/api/areas", "/api/signal/:areaCode", "/api/report/:areaCode"]
  });
});

app.get("/api/areas", (c) => {
  return c.json({
    areas: listAreaOptions(),
    policy: describeServerOnlyConnectorPolicy()
  });
});

app.get("/api/signal/:areaCode", zValidator("param", areaCodeParamSchema), async (c) => {
  const { areaCode } = c.req.valid("param");
  const signal = await connector.fetchByAreaCode(areaCode);

  return c.json({
    signal,
    sourceMode: signal.areaCode === areaCode ? "matched-mock" : "fallback-mock"
  });
});

app.get("/api/report/:areaCode", zValidator("param", areaCodeParamSchema), (c) => {
  const { areaCode } = c.req.valid("param");
  const signal = findAreaSignal(areaCode);

  if (!signal) {
    return c.json(
      {
        error: "DEMO_AREA_NOT_FOUND",
        message: "Requested area code is not available in the demo fixture."
      },
      404
    );
  }

  return c.text(generateMarkdownReport(signal), 200, {
    "content-type": "text/markdown; charset=utf-8"
  });
});

export default app;
