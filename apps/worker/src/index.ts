import { Hono } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createMockAreaSignalConnector, describeServerOnlyConnectorPolicy } from "@local-signal-japan/connectors";
import { findAreaSignal, listAreaOptions } from "@local-signal-japan/core";
import { generateMarkdownReport } from "@local-signal-japan/reporting";

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  PUBLIC_DATA_DB?: D1Database;
};

const areaCodeParamSchema = z.object({
  areaCode: z.string().regex(/^\d{5}$/)
});

const app = new Hono<{ Bindings: Env }>();
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
    routes: ["/api/areas", "/api/signal/:areaCode", "/api/report/:areaCode", "/api/data-sources"]
  });
});

app.get("/api/areas", (c) => {
  return c.json({
    areas: listAreaOptions(),
    policy: describeServerOnlyConnectorPolicy()
  });
});

app.get("/api/data-sources", async (c) => {
  const db = c.env.PUBLIC_DATA_DB;

  if (!db) {
    return c.json({
      storage: "not-bound",
      policy: "D1 is reserved for public data metadata, not search history.",
      sources: [
        {
          sourceName: "Mock e-Stat population",
          areaCode: "13101",
          retrievedAt: "2026-05-09",
          processingNote: "mock fixture only"
        },
        {
          sourceName: "Mock real estate library",
          areaCode: "13101",
          retrievedAt: "2026-05-09",
          processingNote: "mock fixture only"
        }
      ]
    });
  }

  const { results = [] } = await db
    .prepare(
      `
        SELECT source_name AS sourceName,
               source_url_label AS sourceUrlLabel,
               area_code AS areaCode,
               retrieved_at AS retrievedAt,
               published_at AS publishedAt,
               license_note AS licenseNote,
               processing_note AS processingNote,
               is_mock AS isMock
        FROM data_source_snapshots
        ORDER BY retrieved_at DESC, source_name ASC
        LIMIT 50
      `
    )
    .all();

  return c.json({
    storage: "d1",
    policy: "D1 stores source metadata only. It does not store user search terms.",
    sources: results
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
