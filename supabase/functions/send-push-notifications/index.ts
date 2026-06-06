// supabase/functions/send-push-notifications/index.ts
// Supabase Edge Function: Revisa eventos próximos y dispara notificaciones PUSH reales
// Soporta GET y POST para compatibilidad con cron-job.org
// Seguridad: requiere ?secret=CRON_SECRET en la URL

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@pragma.app";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

function getEventStartDateTime(date: string, time: string): Date {
  const timePart = time.split(" - ")[0].trim();
  const [hours, minutes] = timePart.split(":").map(Number);
  const dt = new Date(`${date}T00:00:00`);
  dt.setHours(hours, minutes || 0, 0, 0);
  return dt;
}

function getDynamicLabel(eventTitle: string, eventTime: string, eventStart: Date, now: Date): string {
  const diffMs = eventStart.getTime() - now.getTime();
  const timePart = eventTime.split(" - ")[0];

  if (diffMs <= 0) {
    const passedMins = Math.round(-diffMs / (1000 * 60));
    return passedMins < 60
      ? `Hace ${passedMins} min: ${eventTitle}`
      : `En curso: ${eventTitle}`;
  }

  const diffMins = Math.round(diffMs / (1000 * 60));
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMins < 60) return `En ${diffMins} min: ${eventTitle}`;
  if (diffHours < 24) {
    const h = Math.round(diffHours);
    return `Hoy a las ${timePart} (en ${h} ${h === 1 ? "hora" : "horas"}): ${eventTitle}`;
  }
  if (diffHours < 48) return `Mañana a las ${timePart}: ${eventTitle}`;
  return `En ${Math.round(diffHours / 24)} días: ${eventTitle}`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Validación de seguridad via query param (no requiere JWT de Supabase)
  // Permite que cron-job.org llame sin Authorization header
  const secret = url.searchParams.get("secret");
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Configurar web-push con VAPID keys
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response(JSON.stringify({ error: "VAPID keys no configuradas" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    // 1. Obtener todas las suscripciones activas
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("user_id, endpoint, subscription");

    if (subError) throw subError;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "Sin suscripciones registradas" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const fiveMinMs = 5 * 60 * 1000;
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    let totalSent = 0;
    const errors: string[] = [];

    for (const sub of subscriptions) {
      // 2. Obtener datos del perfil del usuario
      const { data: profile } = await supabase
        .from("profiles")
        .select("day_data")
        .eq("id", sub.user_id)
        .single();

      if (!profile?.day_data) continue;

      const dayData = profile.day_data;
      const readIds: string[] = dayData.read_notifications || [];

      // 3. Recolectar todos los eventos (historial + día actual)
      const todayStr = now.toISOString().split("T")[0];
      const historyEvents = (dayData.history || []).flatMap((h: any) =>
        (h.timeline || []).map((t: any) => ({ ...t, date: h.date }))
      );
      const todayEvents = (dayData.current_day?.timeline || []).map((t: any) => ({
        ...t,
        date: todayStr,
      }));

      const allEventsMap = new Map<string, any>();
      historyEvents.forEach((e: any) => allEventsMap.set(e.id, e));
      todayEvents.forEach((e: any) => allEventsMap.set(e.id, e));
      const allEvents = Array.from(allEventsMap.values());

      for (const event of allEvents) {
        if (!event.time) continue;
        const eventStart = getEventStartDateTime(event.date, event.time);
        if (isNaN(eventStart.getTime())) continue;

        const triggers = [
          { type: "3_days_before", time: new Date(eventStart.getTime() - 3 * 24 * 60 * 60 * 1000) },
          { type: "1_day_before", time: new Date(eventStart.getTime() - 1 * 24 * 60 * 60 * 1000) },
          { type: "1_hour_before", time: new Date(eventStart.getTime() - 1 * 60 * 60 * 1000) },
        ];

        for (const trig of triggers) {
          const notifId = `${event.id}-${trig.type}`;
          const trigMs = trig.time.getTime();

          // Activar si el trigger acaba de dispararse (ventana de 5 min) y no está leído
          const isJustFired = trigMs >= now.getTime() - fiveMinMs && trigMs <= now.getTime();
          const notRead = !readIds.includes(notifId);

          if (isJustFired && notRead) {
            const label = getDynamicLabel(event.title, event.time, eventStart, now);

            const pushPayload = JSON.stringify({
              title: "📅 Pragma",
              body: label,
              tag: notifId,
              url: "/hoy",
            });

            try {
              await webpush.sendNotification(sub.subscription, pushPayload);
              totalSent++;
              console.log(`[push] ✅ Enviado a ${sub.user_id}: ${label}`);
            } catch (err: any) {
              const statusCode = err?.statusCode || err?.status;
              errors.push(`[${event.title}] ${err?.message || err}`);
              console.error(`[push] ❌ Error enviando: ${err?.message}, status: ${statusCode}`);

              // Limpiar suscripciones inválidas (expiradas/revocadas)
              if (statusCode === 410 || statusCode === 404) {
                await supabase
                  .from("push_subscriptions")
                  .delete()
                  .eq("endpoint", sub.endpoint);
                console.log(`[push] 🗑️ Suscripción expirada eliminada: ${sub.endpoint}`);
              }
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sent: totalSent,
        checked: subscriptions.length,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: now.toISOString(),
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-push-notifications] Error fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
