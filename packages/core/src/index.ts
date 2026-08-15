export * from "./resume";

export const APP_NAME = "Emerge CRM";
export const APP_VERSION = "0.1.0";

export type DependencyStatus = "ok" | "fail";

export interface HealthCheck {
  name: string;
  status: DependencyStatus;
  latencyMs?: number;
  error?: string;
}

export interface HealthSummary {
  status: "ok" | "degraded";
  version: string;
  checks: HealthCheck[];
}

/** Rolls individual dependency checks up into an overall health summary. */
export function summarizeHealth(checks: HealthCheck[]): HealthSummary {
  return {
    status: checks.every((c) => c.status === "ok") ? "ok" : "degraded",
    version: APP_VERSION,
    checks
  };
}
