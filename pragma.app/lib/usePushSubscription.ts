"use client";

import { useEffect } from "react";
import { supabase } from "./supabase";
import { registerServiceWorker, subscribeToPush } from "./webpush";

export function usePushSubscription(userId?: string | null) {
  useEffect(() => {
    if (!userId || typeof window === "undefined") return;

    let cancelled = false;

    const setupPush = async () => {
      try {
        await registerServiceWorker();

        const subscription = await subscribeToPush();
        if (!subscription || cancelled) return;

        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session?.access_token) {
          console.warn("[WebPush] No hay sesión activa para guardar la suscripción");
          return;
        }

        const response = await fetch("/api/push-subscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });

        if (!cancelled) {
          if (response.ok) {
            console.log("[WebPush] ✅ Suscripción guardada en Supabase");
          } else {
            const err = await response.json().catch(() => ({}));
            console.error("[WebPush] ❌ Error guardando suscripción:", response.status, err);
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error("[WebPush] Error configurando suscripciones push:", error);
        }
      }
    };

    void setupPush();

    return () => {
      cancelled = true;
    };
  }, [userId]);
}
