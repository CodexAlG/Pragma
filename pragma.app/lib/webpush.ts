// lib/webpush.ts
// Utilidades para registrar el Service Worker y gestionar la suscripción Web Push

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

/**
 * Convierte una clave base64 URL-safe a un ArrayBuffer para la API de Push
 */
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer.slice(0) as ArrayBuffer;
}


/**
 * Registra el Service Worker y retorna el registro
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('[WebPush] Service Worker registrado:', registration.scope);
    return registration;
  } catch (err) {
    console.error('[WebPush] Error registrando Service Worker:', err);
    return null;
  }
}

/**
 * Solicita permiso para notificaciones y suscribe al usuario a Web Push.
 * Retorna la suscripción serializable o null si fue rechazada/no soportada.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[WebPush] NEXT_PUBLIC_VAPID_PUBLIC_KEY no configurada');
    return null;
  }
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[WebPush] Permiso de notificaciones denegado');
      return null;
    }

    const registration = await navigator.serviceWorker.ready;
    const existingSub = await registration.pushManager.getSubscription();
    if (existingSub) return existingSub;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    console.log('[WebPush] Suscripción creada:', subscription.endpoint);
    return subscription;
  } catch (err) {
    console.error('[WebPush] Error al suscribir:', err);
    return null;
  }
}

/**
 * Cancela la suscripción activa
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      console.log('[WebPush] Suscripción cancelada');
      return true;
    }
    return false;
  } catch (err) {
    console.error('[WebPush] Error al desuscribir:', err);
    return false;
  }
}

/**
 * Retorna la suscripción activa o null
 */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}
