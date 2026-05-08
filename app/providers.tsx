"use client";

import { TideCloakProvider } from "@tidecloak/nextjs";
import tcConfig from "../data/tidecloak.json";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TideCloakProvider
      config={{ ...tcConfig, useDPoP: { mode: "strict", alg: "ES256" } }}
    >
      {children}
    </TideCloakProvider>
  );
}
