// supabase/functions/send-push-notifications/index.ts
// Ntfy notifications via Supabase Edge Function

import { createClient } from "jsr:@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const NTFY_TOPIC = Deno.env.get("NTFY_TOPIC") ?? "pragma-notifications";

async function sendNtfy(title: string, body: string, tag: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: "POST",
      headers: {
        "Title": title,
        "Body": body,
        "Tags": "calendar",
        "Priority": "default",
        "Content-Type": "text/plain",
      },
      body,
    });
    if (!res.ok) return { ok: false, error: await res.text() };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function getEventStart(date: string, time: string): Date {
  const t = time.split(" - ")[0].trim();
  const [h, m] = t.split(":").map(Number);
  const d = new Date(`${date}T${String(h).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}:00`);
  return d;
}

function dynamicLabel(title: string, time: string, start: Date, now: Date): string {
  const t = time.split(" - ")[0];
  const diff = start.getTime() - now.getTime();
  if (diff <= 0) return `En curso: ${title}`;
  const mins = Math.round(diff / 60000);
  const hrs = diff / 3600000;
  if (mins < 60) return `En ${mins} min: ${title}`;
  if (hrs < 24) return `Hoy a las ${t} (en ${Math.round(hrs)}h): ${title}`;
  if (hrs < 48) return `Mañana a las ${t}: ${title}`;
  return `En ${Math.round(hrs / 24)} días: ${title}`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");

  if (CRON_SECRET && secret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  console.log("[ntfy] 🚀 Iniciando revisión de notificaciones...");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { data: profiles, error: profileErr } = await supabase
    .from("profiles")
    .select("id, day_data");

  if (profileErr) {
    console.error("[ntfy] ❌ Error leyendo perfiles:", profileErr.message);
    return new Response(JSON.stringify({ error: profileErr.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[ntfy] 📋 Perfiles encontrados: ${profiles?.length ?? 0}`);

  if (!profiles?.length) {
    return new Response(JSON.stringify({ sent: 0, message: "Sin perfiles" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = new Date();
  const win5 = 5 * 60 * 1000;
  let sent = 0;
  const errors: string[] = [];

  for (const profile of profiles) {
    const dd = profile.day_data;
    if (!dd) { console.log(`[ntfy] ⚠️ Sin day_data para ${profile.id}`); continue; }

    const readIds: string[] = dd.read_notifications ?? [];
    const today = now.toISOString().split("T")[0];

    const events = [
      ...(dd.history ?? []).flatMap((h: any) => (h.timeline ?? []).map((t: any) => ({ ...t, date: h.date }))),
      ...(dd.current_day?.timeline ?? []).map((t: any) => ({ ...t, date: today })),
    ];

    console.log(`[ntfy] 📅 Eventos totales para ${profile.id}: ${events.length}`);
    console.log(`[ntfy] 🕐 Now: ${now.toISOString()}`);
    console.log(`[ntfy] 📋 Events sample:`, JSON.stringify(events.slice(0, 2)));

    for (const ev of events) {
      if (!ev.time) continue;
      const start = ev.utc_time ? new Date(ev.utc_time) : getEventStart(ev.date, ev.time);
      if (Number.isNaN(start.getTime())) continue;

      const triggers = [
        { type: "3_days_before", ms: 3 * 86400000 },
        { type: "1_day_before", ms: 86400000 },
        { type: "1_hour_before", ms: 3600000 },
      ];

      for (const tr of triggers) {
        const trigTime = start.getTime() - tr.ms;
        const id = `${ev.id}-${tr.type}`;
        const justFired = trigTime >= now.getTime() - win5 && trigTime <= now.getTime();
        const alreadyRead = readIds.includes(id);

        console.log(`[ntfy] checking ${ev.title} trigger ${tr.type}: trigTime=${new Date(trigTime).toISOString()} justFired=${justFired} alreadyRead=${alreadyRead}`);

        if (justFired && !alreadyRead) {
          const label = dynamicLabel(ev.title, ev.time, start, now);
          console.log(`[ntfy] 🔔 Enviando: "${label}" (tag=${id})`);

          const result = await sendNtfy("📅 Pragma", label, id);

          if (result.ok) {
            sent++;
            console.log("[ntfy] ✅ Enviado OK");
          } else {
            errors.push(`${ev.title}: ${result.error}`);
            console.error(`[ntfy] ❌ Error: ${result.error}`);
          }
        }
      }
    }
  }

  console.log(`[ntfy] ✅ Finalizado. Enviadas: ${sent}, Errores: ${errors.length}`);

  return new Response(
    JSON.stringify({ ok: true, sent, errors: errors.length ? errors : undefined, ts: now.toISOString() }),
    { headers: { "Content-Type": "application/json" } }
  );
});
