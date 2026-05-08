"use client";

import { useAuthCallback } from "@tidecloak/nextjs";
import { useEffect, useState } from "react";

function RedirectHandler() {
  const { isProcessing, isSuccess, error } = useAuthCallback({
    onSuccess: (returnUrl) => {
      window.location.assign(returnUrl || "/");
    },
    onError: () => {
      window.location.assign("/");
    },
    onMissingVerifierRedirectTo: "/",
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("code") && !params.has("error")) {
      window.location.assign("/");
    }
  }, []);

  if (error) {
    return <p className="p-8 font-mono text-sm">authentication failed: {error.message}</p>;
  }

  if (isProcessing || !isSuccess) {
    return <p className="p-8 font-mono text-sm">completing login...</p>;
  }

  return <p className="p-8 font-mono text-sm">redirecting...</p>;
}

export default function AuthRedirectPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <p className="p-8 font-mono text-sm">loading...</p>;
  return <RedirectHandler />;
}
