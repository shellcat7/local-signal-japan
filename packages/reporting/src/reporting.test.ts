import { describe, expect, it } from "vitest";
import { getDefaultAreaSignal } from "@local-signal-japan/core";
import { generateMarkdownReport } from "./index";

describe("generateMarkdownReport", () => {
  it("includes attribution and non-deterministic wording guardrails", () => {
    const report = generateMarkdownReport(getDefaultAreaSignal());

    expect(report).toContain("公開データ上のシグナル");
    expect(report).toContain("地域の成長・停滞を断定しません");
    expect(report).toContain("Mock e-Stat population");
    expect(report).toContain("retrieved: 2026-05-09");
  });
});
