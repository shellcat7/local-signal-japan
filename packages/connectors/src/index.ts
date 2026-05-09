import { findAreaSignal, getDefaultAreaSignal } from "@local-signal-japan/core";
import type { AreaSignal } from "@local-signal-japan/schemas";

export type ConnectorMode = "mock" | "server-api";

export type AreaSignalConnector = {
  readonly mode: ConnectorMode;
  fetchByAreaCode(areaCode: string): Promise<AreaSignal>;
};

export function createMockAreaSignalConnector(): AreaSignalConnector {
  return {
    mode: "mock",
    async fetchByAreaCode(areaCode: string) {
      return findAreaSignal(areaCode) ?? getDefaultAreaSignal();
    }
  };
}

export function describeServerOnlyConnectorPolicy(): string[] {
  return [
    "API keys are read only inside Cloudflare Workers or Pages Functions.",
    "Browser bundles receive normalized signal data, not upstream API payloads.",
    "Search terms and request metadata are not stored by the application."
  ];
}
