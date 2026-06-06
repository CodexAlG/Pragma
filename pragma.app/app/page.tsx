"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { pragmaDb } from "../lib/supabase";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    async function checkSession() {
      try {
        const user = await pragmaDb.getUser();
        if (user) {
          router.push("/hoy");
        } else {
          router.push("/login");
        }
      } catch (e) {
        console.error("Redirect check failed:", e);
        router.push("/login");
      }
    }
    checkSession();
  }, [router]);

  return (
    <div className="flex flex-1 items-center justify-center bg-background text-text-primary">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-purple border-t-transparent"></div>
        <span className="font-mono text-xs text-text-secondary">PRAGMA</span>
      </div>
    </div>
  );
}
