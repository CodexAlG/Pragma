-- =====================================================
-- PRAGMA — Web Push Notifications Setup
-- Ejecuta este SQL en el SQL Editor de Supabase Dashboard
-- =====================================================

-- 1. Crear la tabla de suscripciones push
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  subscription JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

-- 2. Habilitar Row Level Security
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 3. Policy: cada usuario solo puede ver/editar sus propias suscripciones
CREATE POLICY "push_subscriptions_user_policy" ON public.push_subscriptions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Policy: el service role (Edge Function) puede leer todo
CREATE POLICY "push_subscriptions_service_role_policy" ON public.push_subscriptions
  FOR SELECT
  TO service_role
  USING (true);

-- 5. Index para búsquedas por usuario
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions(user_id);

-- =====================================================
-- CRON: Disparar notificaciones push cada 5 minutos
-- Requiere que la extensión pg_cron esté habilitada
-- (En Supabase Pro ya viene habilitada por defecto)
-- =====================================================

-- Habilitar pg_cron si no está activo
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Crear el cron job (reemplaza <TU_PROJECT_ID> con: hjatltuapxpwfbyvqtiv)
SELECT cron.schedule(
  'pragma-push-notifications',   -- nombre del job
  '*/5 * * * *',                 -- cada 5 minutos
  $$
    SELECT net.http_post(
      url := 'https://hjatltuapxpwfbyvqtiv.supabase.co/functions/v1/send-push-notifications',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);

