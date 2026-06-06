# Pragma — Day Orchestrator

> Vuelca tu día en lenguaje natural. Pragma lo convierte en una agenda ordenada con métricas de esfuerzo.

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?style=flat-square)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-38bdf8?style=flat-square)
![Supabase](https://img.shields.io/badge/Supabase-auth%20%2B%20db-3ecf8e?style=flat-square)

---

## ¿Qué es Pragma?

Pragma es una web app personal de productividad para desarrolladores. En lugar de llenar formularios o arrastrar tarjetas en un kanban, simplemente escribes tu día en lenguaje natural:

> "Revisión de código de 9 a 10. Reunión de equipo a las 11. Investigar el bug de la pasarela de pagos. IDEA: Implementar caché para peticiones de geolocalización."

Pragma detecta automáticamente tareas, reuniones e ideas, te hace preguntas de contexto, y genera una agenda ordenada con métricas de esfuerzo técnico vs administrativo.

---

## Features

- **Brain dump** — textarea con parser en tiempo real que detecta keywords
- **Flag chips** — detección automática de código, reuniones e ideas
- **Resolución de contexto** — preguntas dinámicas según lo detectado
- **Timeline ordenado** — prioridad: Dev → Reuniones → Cliente → Bugs → Ideas
- **Donut chart** — distribución de esfuerzo técnico vs gestión vs ideas
- **Barra de progreso** — tareas completadas del día
- **Bóveda de ideas** — drawer con ideas guardadas, tags automáticos y estado Pendiente/Cumplida
- **Modo Enfoque** — Pomodoro timer + vista de tarea única
- **Proyectos** — lista de proyectos con tareas y progress bar
- **Historial** — calendario mensual con días orquestados anteriores
- **Notificaciones push** — via Ntfy, con anticipación de 1h, 1 día y 3 días
- **PWA** — instalable en móvil como app nativa
- **Multi-dispositivo** — datos sincronizados via Supabase entre PC, laptop y cel

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 16, TypeScript, Tailwind CSS v4 |
| Componentes | shadcn/ui |
| Auth | Supabase Auth (Google OAuth) |
| Base de datos | Supabase (PostgreSQL + JSONB) |
| Notificaciones | Ntfy.sh + Supabase Edge Functions + Cron |
| Deploy | Vercel |

---

## Estructura del repositorio

```
Pragma/
├── pragma.app/                  # Aplicación Next.js
│   ├── app/
│   │   ├── api/push-subscribe/  # (legacy — no se usa)
│   │   ├── auth/callback/       # OAuth callback handler
│   │   ├── enfoque/             # Modo Pomodoro + tarea única
│   │   ├── historial/           # Calendario de días pasados
│   │   ├── hoy/                 # Dashboard principal
│   │   ├── login/               # Pantalla de login con Google
│   │   ├── proyectos/           # Lista de proyectos con tareas
│   │   ├── globals.css          # Tokens de color y estilos base
│   │   ├── layout.tsx           # Layout raíz + metadata
│   │   ├── manifest.ts          # PWA manifest
│   │   └── page.tsx             # Redirect / → /hoy o /login
│   ├── components/
│   │   └── AppLayout.tsx        # Sidebar, topbar, drawer (compartido)
│   ├── lib/
│   │   ├── parser.ts            # Parser de texto + lógica de ordenamiento
│   │   ├── supabase.ts          # Cliente Supabase + tipos TypeScript
│   │   └── webpush.ts           # (legacy — no se usa)
│   ├── public/                  # Íconos PWA + Service Worker
│   ├── next.config.ts
│   ├── package.json
│   └── tsconfig.json
├── supabase/
│   ├── functions/
│   │   └── send-push-notifications/
│   │       └── index.ts         # Edge Function para notificaciones Ntfy
│   └── migrations/
│       └── push_subscriptions.sql  # (legacy — no se usa)
├── Pragma.html                  # Prototipo HTML original (referencia)
└── README.md
```

---

## Requisitos previos

- Node.js 18+
- Cuenta en [Supabase](https://supabase.com) (tier gratuito funciona)
- Cuenta en [Vercel](https://vercel.com) (tier gratuito funciona)
- Proyecto en [Google Cloud Console](https://console.cloud.google.com) con OAuth configurado
- App [Ntfy](https://ntfy.sh) instalada en tu móvil (opcional, para notificaciones)

---

## Instalación

### 1. Clona el repositorio

```bash
git clone https://github.com/tu-usuario/pragma.git
cd pragma/pragma.app
npm install
```

### 2. Configura Supabase

#### Crea el proyecto
1. Ve a [supabase.com](https://supabase.com) → New project
2. Guarda la contraseña generada

#### Crea la tabla en SQL Editor

```sql
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  day_data jsonb default '{}',
  updated_at timestamp with time zone default now()
);

alter table profiles enable row level security;

create policy "Users can only access own profile"
on profiles for all
using (auth.uid() = id);
```

#### Activa Google OAuth
1. Supabase Dashboard → Authentication → Sign In / Providers → Google
2. Pega tu Client ID y Client Secret de Google Cloud Console
3. Copia la **Callback URL** que te muestra Supabase

#### Configura Google Cloud Console
1. Ve a [console.cloud.google.com](https://console.cloud.google.com)
2. APIs & Services → Credentials → tu OAuth Client
3. En **Authorized redirect URIs** agrega la Callback URL de Supabase
4. En **Authorized JavaScript origins** agrega tu dominio de Vercel
5. Guarda y espera ~2 minutos

#### Configura URLs en Supabase
Authentication → URL Configuration:
- **Site URL:** `https://tu-proyecto.vercel.app`
- **Redirect URLs:** `https://tu-proyecto.vercel.app/**`

### 3. Variables de entorno

Crea `.env.local` en `pragma.app/`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=tu_publishable_key
NEXT_PUBLIC_SITE_URL=https://tu-proyecto.vercel.app
NEXT_PUBLIC_VAPID_PUBLIC_KEY=tu_vapid_public_key
```

> Las keys de Supabase las encuentras en: Project Settings → API

### 4. Corre en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

---

## Deploy en Vercel

### 1. Sube el proyecto a GitHub y conéctalo en Vercel

### 2. Configura el Root Directory
En Vercel → Project Settings → General → Root Directory: `pragma.app`

### 3. Agrega las variables de entorno en Vercel
Settings → Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_VAPID_PUBLIC_KEY
```

### 4. Redeploy después de agregar las variables

---

## Notificaciones push con Ntfy (opcional)

Pragma puede enviarte notificaciones 1 hora, 1 día y 3 días antes de tus eventos via la app Ntfy.

### 1. Instala Ntfy en tu móvil
- [Android — Play Store](https://play.google.com/store/apps/details?id=io.heckel.ntfy)
- [iOS — App Store](https://apps.apple.com/us/app/ntfy/id1625396347)

### 2. Crea tu canal único
Abre Ntfy → "+" → escribe un nombre único como `pragma-tu-nombre-2026`

### 3. Genera claves VAPID
```bash
npx web-push generate-vapid-keys
```

### 4. Agrega secrets en Supabase
Edge Functions → send-push-notifications → Secrets:

```
NTFY_TOPIC=pragma-tu-nombre-2026
VAPID_PUBLIC_KEY=tu_vapid_public_key
VAPID_PRIVATE_KEY=tu_vapid_private_key
VAPID_SUBJECT=mailto:tu@email.com
CRON_SECRET=cadena_secreta_aleatoria
SUPABASE_URL=https://tu-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

### 5. Deploy del Edge Function
```bash
# Desde la raíz del repo
supabase functions deploy send-push-notifications
```

### 6. Configura el Cron en Supabase
Dashboard → Edge Functions → Schedules → New schedule:
- **Frecuencia:** `*/5 * * * *` (cada 5 minutos)
- **URL:** `https://tu-project-id.supabase.co/functions/v1/send-push-notifications?secret=tu_cron_secret`

---

## Estructura de datos (day_data JSONB)

Todo se guarda en un solo campo JSONB por usuario — sin tablas adicionales:

```json
{
  "current_day": {
    "date": "2026-06-06",
    "raw_text": "Revisión de código de 9 a 10...",
    "flags": ["code_review", "meeting"],
    "timezone": "America/Hermosillo",
    "timeline": [
      {
        "id": "unique-id",
        "time": "09:00 - 10:00",
        "utc_time": "2026-06-06T16:00:00.000Z",
        "type": "dev",
        "title": "Revisión de código",
        "status": "pending"
      }
    ],
    "context_answers": {},
    "effort_distribution": { "dev": 60, "meeting": 30, "idea": 10 }
  },
  "history": [],
  "vault": [],
  "projects": [],
  "read_notifications": []
}
```

---

## Personalización

### Cambiar el parser de keywords
Edita `pragma.app/lib/parser.ts` — agrega o modifica las listas de keywords para dev, meetings e ideas según tu vocabulario.

### Cambiar el orden del timeline
En `lib/parser.ts` modifica la función de ordenamiento. Prioridad actual:
1. Dev / código / PR
2. Reuniones internas
3. Llamadas con clientes
4. Bugs / investigación
5. Ideas (siempre al final)

### Cambiar los colores
En `app/globals.css` están todos los tokens. Los principales:

```css
--accent-purple: #7c6fe0;   /* Color primario, botones */
--accent-teal:   #2dd4a0;   /* Completado, éxito */
--accent-amber:  #d4a06a;   /* Ideas, bóveda */
```

### Cambiar los intervalos de notificación
En `supabase/functions/send-push-notifications/index.ts` modifica el array `triggers`:

```typescript
const triggers = [
  { type: "3_days_before", ms: 3 * 86400000 },
  { type: "1_day_before",  ms: 86400000     },
  { type: "1_hour_before", ms: 3600000      },
];
```

---

## Notas importantes

- **`lib/webpush.ts`** y **`app/api/push-subscribe/`** son archivos legacy del intento de Web Push nativo. No se usan — puedes eliminarlos si quieres limpiar el proyecto.
- **`supabase/migrations/push_subscriptions.sql`** también es legacy. La tabla `push_subscriptions` ya no se necesita con Ntfy.
- **`Pragma.html`** en la raíz es el prototipo HTML original generado durante el diseño — solo referencia visual.

---

## Licencia

MIT — úsalo, modifícalo, compártelo.

---

Hecho con Next.js, Supabase y demasiado café. ☕
