import { readFileSync } from "fs";
import { join } from "path";

export interface TidecloakConfig {
  realm: string;
  "auth-server-url": string;
  "ssl-required": string;
  resource: string;
  "public-client": boolean;
  "confidential-port": number;
  jwk: { keys: unknown[] };
  vendorId?: string;
  homeOrkUrl?: string;
}

export function loadTideConfig(): TidecloakConfig {
  if (process.env.CLIENT_ADAPTER) {
    return JSON.parse(process.env.CLIENT_ADAPTER);
  }

  const configPath = join(process.cwd(), "data", "tidecloak.json");
  const config = JSON.parse(readFileSync(configPath, "utf-8"));

  if (!config.jwk) {
    throw new Error(
      "Adapter JSON missing jwk field. Run `npm run init` to bootstrap TideCloak and re-export the adapter."
    );
  }

  return config;
}
