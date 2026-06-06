// supabase/functions/send-push-notifications/index.ts
// Web Push con Web Crypto API nativa — sin dependencias externas

import { createClient } from "jsr:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@pragma.app";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

// ── Helpers base64url ─────────────────────────────────────────────────────────
const b64 = {
  encode: (buf: Uint8Array) =>
    btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""),
  decode: (s: string) => {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  },
};

const enc = new TextEncoder();

// ── VAPID JWT ─────────────────────────────────────────────────────────────────
async function vapidJWT(audience: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64.encode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64.encode(enc.encode(JSON.stringify({ aud: audience, exp: now + 43200, sub: VAPID_SUBJECT })));
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(VAPID_PRIVATE_KEY),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(data));
  return `${data}.${b64.encode(new Uint8Array(sig))}`;
}

// Convierte clave privada raw base64url a DER PKCS8 para WebCrypto
function pemToDer(rawBase64url: string): ArrayBuffer {
  // Si es clave raw EC P-256 (32 bytes), envolvemos en PKCS8
  const raw = b64.decode(rawBase64url);
  if (raw.length === 32) {
    // PKCS8 wrapper para EC P-256 private key
    const header = new Uint8Array([
      0x30, 0x41, // SEQUENCE
      0x02, 0x01, 0x00, // version = 0
      0x30, 0x13, // SEQUENCE (AlgorithmIdentifier)
      0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID ecPublicKey
      0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // OID P-256
      0x04, 0x27, // OCTET STRING
      0x30, 0x25, // SEQUENCE (ECPrivateKey)
      0x02, 0x01, 0x01, // version = 1
      0x04, 0x20, // OCTET STRING (32 bytes)
    ]);
    const pkcs8 = new Uint8Array(header.length + raw.length);
    pkcs8.set(header);
    pkcs8.set(raw, header.length);
    return pkcs8.buffer;
  }
  return raw.buffer;
}

// ── AES-128-GCM Web Push Encryption (RFC 8188 / aes128gcm) ───────────────────
async function encryptPayload(
  sub: { keys: { p256dh: string; auth: string } },
  payload: string
): Promise<{ ciphertext: ArrayBuffer; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const authSecret = b64.decode(sub.keys.auth);
  const recipientPublicKey = b64.decode(sub.keys.p256dh);

  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeyPair.publicKey)
  );

  const recipientKey = await crypto.subtle.importKey(
    "raw", recipientPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []
  );

  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientKey }, serverKeyPair.privateKey, 256
  );

  // PRK via HKDF-SHA256 with auth
  const prkKey = await crypto.subtle.importKey("raw", new Uint8Array(sharedSecret), "HKDF", false, ["deriveBits"]);
  const prk = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: authSecret, info: enc.encode("WebPush: info\x00") },
    prkKey, 256
  );

  // Derive content encryption key (16 bytes) and nonce (12 bytes)
  const contentKey = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: enc.encode("Content-Encoding: aes128gcm\x00") },
    await crypto.subtle.importKey("raw", prk, "HKDF", false, ["deriveBits"]), 128
  ));
  const nonce = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: enc.encode("Content-Encoding: nonce\x00") },
    await crypto.subtle.importKey("raw", prk, "HKDF", false, ["deriveBits"]), 96
  ));

  const aesKey = await crypto.subtle.importKey("raw", contentKey, "AES-GCM", false, ["encrypt"]);
  const payloadBytes = enc.encode(payload);

  // Padding: 1 byte delimiter (0x02) + payload
  const padded = new Uint8Array(payloadBytes.length + 1);
  padded[0] = 0x02;
  padded.set(payloadBytes, 1);

  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded);

  return { ciphertext, salt, serverPublicKey: serverPublicKeyRaw };
}

// ── Send one push notification ────────────────────────────────────────────────
async function sendPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: object
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const endpoint = subscription.endpoint;
  const { protocol, host } = new URL(endpoint);
  const jwt = await vapidJWT(`${protocol}//${host}`);

  const payloadStr = JSON.stringify(payload);

  let body: ArrayBuffer;
  let contentType: string;
  let contentEncoding: string;

  try {
    const { ciphertext, salt, serverPublicKey } = await encryptPayload(subscription, payloadStr);

    // aes128gcm record header: salt (16) + rs (4) + keyid_len (1) + keyid (65)
    const rs = new Uint8Array(4);
    new DataView(rs.buffer).setUint32(0, 4096, false);
    const header = new Uint8Array(16 + 4 + 1 + serverPublicKey.length);
    header.set(salt, 0);
    header.set(rs, 16);
    header[20] = serverPublicKey.length;
    header.set(serverPublicKey, 21);

    const fullBody = new Uint8Array(header.length + ciphertext.byteLength);
    fullBody.set(header, 0);
    fullBody.set(new Uint8Array(ciphertext), header.length);

    body = fullBody.buffer;
    contentType = "application/octet-stream";
    contentEncoding = "aes128gcm";
  } catch (_) {
    // Si la encriptación falla, enviar sin cifrar como fallback
    body = enc.encode(payloadStr).buffer;
    contentType = "text/plain;charset=UTF-8";
    contentEncoding = "";
  }

  const headers: Record<string, string> = {
    "Authorization": `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
    "Content-Type": contentType,
    "TTL": "86400",
  };
  if (contentEncoding) headers["Content-Encoding"] = contentEncoding;

  try {
    const res = await fetch(endpoint, { method: "POST", headers, body });
    const text = await res.text().catch(() => "");
    if (!res.ok) return { ok: false, status: res.status, error: text };
    return { ok: true, status: res.status };
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

  console.log("[push] 🚀 Iniciando revisión de notificaciones...");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { data: subs, error: subErr } = await supabase
    .from("push_subscriptions")
    .select("user_id, endpoint, subscription");

  if (subErr) {
    console.error("[push] ❌ Error leyendo suscripciones:", subErr.message);
    return new Response(JSON.stringify({ error: subErr.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[push] 📋 Suscripciones encontradas: ${subs?.length ?? 0}`);

  if (!subs?.length) {
    return new Response(JSON.stringify({ sent: 0, message: "Sin suscripciones" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = new Date();
  const win5 = 5 * 60 * 1000;
  let sent = 0;
  const errors: string[] = [];

  for (const sub of subs) {
    const { data: profile } = await supabase
      .from("profiles").select("day_data").eq("id", sub.user_id).single();

    if (!profile?.day_data) { console.log(`[push] ⚠️ Sin day_data para ${sub.user_id}`); continue; }

    const dd = profile.day_data;
    const readIds: string[] = dd.read_notifications ?? [];
    const today = now.toISOString().split("T")[0];

    const events = [
      ...(dd.history ?? []).flatMap((h: any) => (h.timeline ?? []).map((t: any) => ({ ...t, date: h.date }))),
      ...(dd.current_day?.timeline ?? []).map((t: any) => ({ ...t, date: today })),
    ];

    console.log(`[push] 📅 Eventos totales para ${sub.user_id}: ${events.length}`);
    console.log(`[push] 🕐 Now: ${now.toISOString()}`);
    console.log(`[push] 📋 Events sample:`, JSON.stringify(events.slice(0, 2)));

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

        console.log(`[push] checking ${ev.title} trigger ${tr.type}: trigTime=${new Date(trigTime).toISOString()} justFired=${justFired} alreadyRead=${alreadyRead}`);

        if (justFired && !alreadyRead) {
          const label = dynamicLabel(ev.title, ev.time, start, now);
          console.log(`[push] 🔔 Enviando: "${label}" → ${sub.endpoint.slice(0, 60)}...`);

          const result = await sendPush(sub.subscription, {
            title: "📅 Pragma", body: label, tag: id, url: "/hoy",
          });

          if (result.ok) {
            sent++;
            console.log(`[push] ✅ Enviado OK (status ${result.status})`);
          } else {
            errors.push(`${ev.title}: ${result.error}`);
            console.error(`[push] ❌ Error: status=${result.status} msg=${result.error}`);
            if (result.status === 410 || result.status === 404) {
              await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
              console.log("[push] 🗑️ Suscripción expirada eliminada");
            }
          }
        }
      }
    }
  }

  console.log(`[push] ✅ Finalizado. Enviadas: ${sent}, Errores: ${errors.length}`);

  return new Response(
    JSON.stringify({ ok: true, sent, errors: errors.length ? errors : undefined, ts: now.toISOString() }),
    { headers: { "Content-Type": "application/json" } }
  );
});
