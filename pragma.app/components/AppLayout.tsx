"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { pragmaDb, VaultItem, DayData, PragmaUser } from "../lib/supabase";
import { autoTagIdea } from "../lib/parser";
import {
  Calendar,
  Target,
  Kanban,
  Lightbulb,
  History,
  X,
  LogOut,
  CheckCircle2,
  Circle,
  Trash2,
  Plus,
  Bell,
  Check,
} from "lucide-react";

export interface PragmaNotification {
  id: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  triggerTime: string;
  type: "3_days_before" | "1_day_before" | "1_hour_before";
  label: string;
}

interface AppLayoutContextType {
  user: PragmaUser | null;
  dayData: DayData | null;
  loading: boolean;
  updateDayData: (newDayData: DayData) => Promise<boolean>;
  triggerToast: (msg: string) => void;
  vault: VaultItem[];
  setVault: React.Dispatch<React.SetStateAction<VaultItem[]>>;
  refreshProfile: () => Promise<void>;
  notifications: PragmaNotification[];
  markNotificationAsRead: (id: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
}

const AppLayoutContext = createContext<AppLayoutContextType | null>(null);

export function useAppLayout() {
  const context = useContext(AppLayoutContext);
  if (!context) {
    throw new Error("useAppLayout must be used within an AppLayoutProvider");
  }
  return context;
}

// Persistent caching variables in module scope to prevent loading flickers on route change remounts
let hasLoadedOnce = false;
let cachedUser: PragmaUser | null = null;
let cachedDayData: DayData | null = null;
let cachedVault: VaultItem[] = [];

function getEventStartDateTime(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  let hour = 0;
  let min = 0;

  if (timeStr) {
    const timeMatch = timeStr.match(/\b(\d{1,2}):(\d{2})\b/);
    if (timeMatch) {
      hour = Number(timeMatch[1]);
      min = Number(timeMatch[2]);
    }
  }

  // Month is 0-indexed in JS Date, so month - 1
  return new Date(year, month - 1, day, hour, min, 0);
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<PragmaUser | null>(cachedUser);
  const [dayData, setDayData] = useState<DayData | null>(cachedDayData);
  const [vault, setVault] = useState<VaultItem[]>(cachedVault);
  const [loading, setLoading] = useState(!hasLoadedOnce);

  // UI state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newIdeaText, setNewIdeaText] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);

  const triggerToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  const loadProfile = async () => {
    try {
      const activeUser = await pragmaDb.getUser();
      if (!activeUser) {
        // Reset cache on redirect to login
        hasLoadedOnce = false;
        cachedUser = null;
        cachedDayData = null;
        cachedVault = [];
        setUser(null);
        setDayData(null);
        setVault([]);
        router.push("/login");
        return;
      }
      setUser(activeUser);
      cachedUser = activeUser;

      const profile = await pragmaDb.getProfile();
      if (profile && profile.day_data) {
        setDayData(profile.day_data);
        cachedDayData = profile.day_data;
        setVault(profile.day_data.vault || []);
        cachedVault = profile.day_data.vault || [];
      }
    } catch (e) {
      console.error("Error loading layout profile:", e);
    } finally {
      setLoading(false);
      hasLoadedOnce = true;
    }
  };

  const isAuthPage = pathname === "/login" || pathname === "/" || pathname?.startsWith("/auth");

  useEffect(() => {
    if (!isAuthPage) {
      loadProfile();
    } else {
      // Clear cache on auth pages
      hasLoadedOnce = false;
      cachedUser = null;
      cachedDayData = null;
      cachedVault = [];
      setUser(null);
      setDayData(null);
      setVault([]);
      setLoading(false);
    }
  }, [router, pathname, isAuthPage]);

  const refreshProfile = async () => {
    const profile = await pragmaDb.getProfile();
    if (profile && profile.day_data) {
      setDayData(profile.day_data);
      cachedDayData = profile.day_data;
      setVault(profile.day_data.vault || []);
      cachedVault = profile.day_data.vault || [];
    }
  };

  const updateDayData = async (newDayData: DayData): Promise<boolean> => {
    const success = await pragmaDb.updateDayData(newDayData);
    if (success) {
      setDayData(newDayData);
      cachedDayData = newDayData;
      setVault(newDayData.vault || []);
      cachedVault = newDayData.vault || [];
    }
    return success;
  };

  // Notification methods
  const getNotifications = (): PragmaNotification[] => {
    if (!dayData) return [];

    const notifications: PragmaNotification[] = [];
    const readIds = dayData.read_notifications || [];
    const now = new Date();
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Get all events from history
    const historyEvents = (dayData.history || []).flatMap(h => 
      (h.timeline || []).map(t => ({ ...t, date: h.date }))
    );

    // Also get today's timeline events
    const todayStr = now.toISOString().split("T")[0];
    const todayEvents = (dayData.current_day?.timeline || []).map(t => ({ ...t, date: todayStr }));

    // Merge events and deduplicate by ID
    const allEventsMap = new Map<string, any>();
    historyEvents.forEach(e => allEventsMap.set(e.id, e));
    todayEvents.forEach(e => allEventsMap.set(e.id, e));
    const allEvents = Array.from(allEventsMap.values());

    allEvents.forEach(event => {
      if (!event.time) return;

      const eventStart = getEventStartDateTime(event.date, event.time);
      if (isNaN(eventStart.getTime())) return;

      const triggers = [
        {
          type: "3_days_before" as const,
          time: new Date(eventStart.getTime() - 3 * 24 * 60 * 60 * 1000),
          label: `Faltan 3 días para: ${event.title}`
        },
        {
          type: "1_day_before" as const,
          time: new Date(eventStart.getTime() - 1 * 24 * 60 * 60 * 1000),
          label: `Falta 1 día para: ${event.title}`
        },
        {
          type: "1_hour_before" as const,
          time: new Date(eventStart.getTime() - 1 * 60 * 60 * 1000),
          label: `Falta 1 hora para: ${event.title}`
        }
      ];

      triggers.forEach(trig => {
        const id = `${event.id}-${trig.type}`;
        if (trig.time <= now && trig.time >= fortyEightHoursAgo && !readIds.includes(id)) {
          notifications.push({
            id,
            eventTitle: event.title,
            eventDate: event.date,
            eventTime: event.time,
            triggerTime: trig.time.toISOString(),
            type: trig.type,
            label: trig.label
          });
        }
      });
    });

    return notifications.sort((a, b) => b.triggerTime.localeCompare(a.triggerTime));
  };

  const markNotificationAsRead = async (id: string) => {
    if (!dayData) return;
    const readIds = dayData.read_notifications || [];
    if (!readIds.includes(id)) {
      const updatedDayData: DayData = {
        ...dayData,
        read_notifications: [...readIds, id]
      };
      await updateDayData(updatedDayData);
    }
  };

  const markAllNotificationsAsRead = async () => {
    if (!dayData) return;
    const active = getNotifications();
    const activeIds = active.map(n => n.id);
    const readIds = dayData.read_notifications || [];
    const newReadIds = Array.from(new Set([...readIds, ...activeIds]));

    const updatedDayData: DayData = {
      ...dayData,
      read_notifications: newReadIds
    };
    await updateDayData(updatedDayData);
    triggerToast("Recordatorios archivados.");
  };

  const activeNotifications = getNotifications();

  // Request browser permission for system notifications
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Monitor and fire browser notifications when app is active
  const lastCheckRef = useRef<number>(Date.now());
  const shownNotificationIds = useRef<string[]>([]);

  const showSystemNotification = (title: string, body: string) => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification(title, {
        body,
        icon: "/origami_p_icon.png"
      });
    }
  };

  useEffect(() => {
    if (isAuthPage || !dayData) return;

    const checkNewNotifications = () => {
      const active = getNotifications();
      const nowMs = Date.now();

      active.forEach(notif => {
        const trigTimeMs = new Date(notif.triggerTime).getTime();
        // If trigger time is very recent (within last 5 mins) and not shown in this session
        if (nowMs - trigTimeMs < 5 * 60 * 1000 && !shownNotificationIds.current.includes(notif.id)) {
          shownNotificationIds.current.push(notif.id);
          showSystemNotification("Pragma Recordatorio", notif.label);
          triggerToast(`Recordatorio: ${notif.label}`);
        }
      });
      lastCheckRef.current = nowMs;
    };

    const interval = setInterval(checkNewNotifications, 30000);
    checkNewNotifications();

    return () => clearInterval(interval);
  }, [dayData, isAuthPage]);

  // Add manual idea via drawer
  const handleAddManualIdea = async () => {
    if (!newIdeaText.trim()) return;

    const newIdea: VaultItem = {
      id: `${Date.now()}-manual-idea`,
      text: newIdeaText.trim(),
      tag: autoTagIdea(newIdeaText),
      created_at: new Date().toISOString().split("T")[0],
      status: "pending",
    };

    const updatedVault = [...vault, newIdea];
    const updatedDayData: DayData = {
      ...dayData,
      vault: updatedVault,
    };

    const success = await updateDayData(updatedDayData);
    if (success) {
      setNewIdeaText("");
      triggerToast("Idea guardada en la bóveda.");
    }
  };

  // Delete idea from drawer
  const handleDeleteIdea = async (ideaId: string) => {
    const updatedVault = vault.filter((v) => v.id !== ideaId);
    const updatedDayData: DayData = {
      ...dayData,
      vault: updatedVault,
    };

    const success = await updateDayData(updatedDayData);
    if (success) {
      triggerToast("Idea eliminada de la bóveda.");
    }
  };

  // Toggle idea status
  const handleToggleIdeaStatus = async (ideaId: string) => {
    const updatedVault = vault.map((v) => {
      if (v.id === ideaId) {
        return {
          ...v,
          status: v.status === "completed" ? ("pending" as const) : ("completed" as const),
        };
      }
      return v;
    });

    const updatedDayData: DayData = {
      ...dayData,
      vault: updatedVault,
    };

    await updateDayData(updatedDayData);
  };

  const getFormattedDate = () => {
    const d = new Date();
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return `${days[d.getDay()]}, ${d.getDate().toString().padStart(2, "0")} ${months[d.getMonth()]}`;
  };

  if (isAuthPage) {
    return (
      <AppLayoutContext.Provider
        value={{
          user,
          dayData,
          loading: false,
          updateDayData,
          triggerToast,
          vault,
          setVault,
          refreshProfile,
          notifications: [],
          markNotificationAsRead: async () => {},
          markAllNotificationsAsRead: async () => {},
        }}
      >
        {children}
      </AppLayoutContext.Provider>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-[#0a0e1a] text-text-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#7c6fe0] border-t-transparent"></div>
          <span className="font-mono text-xs text-text-secondary uppercase tracking-wider">
            Cargando sesión...
          </span>
        </div>
      </div>
    );
  }

  return (
    <AppLayoutContext.Provider
      value={{
        user,
        dayData,
        loading,
        updateDayData,
        triggerToast,
        vault,
        setVault,
        refreshProfile,
        notifications: activeNotifications,
        markNotificationAsRead,
        markAllNotificationsAsRead,
      }}
    >
      <div className="min-h-screen flex bg-[#0a0e1a] text-text-primary overflow-x-hidden font-sans">
        {/* SIDEBAR - Desktop (Fixed 220px) */}
        <aside className="hidden md:flex flex-col fixed left-0 top-0 h-screen w-[220px] bg-[#111827] border-r border-white/5 select-none shrink-0 z-30">
          <div className="flex flex-col flex-1 py-6">
            <nav className="space-y-1.5 px-4">
              <Link
                href="/hoy"
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  pathname === "/hoy"
                    ? "bg-[#1a2236] text-white"
                    : "text-text-secondary hover:text-white hover:bg-white/5"
                }`}
              >
                <Calendar
                  className={`h-4.5 w-4.5 ${pathname === "/hoy" ? "text-[#7c6fe0]" : ""}`}
                />
                <span>Hoy</span>
              </Link>
              <Link
                href="/enfoque"
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  pathname === "/enfoque"
                    ? "bg-[#1a2236] text-white"
                    : "text-text-secondary hover:text-white hover:bg-white/5"
                }`}
              >
                <Target
                  className={`h-4.5 w-4.5 ${pathname === "/enfoque" ? "text-[#7c6fe0]" : ""}`}
                />
                <span>Enfoque</span>
              </Link>
              <Link
                href="/proyectos"
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  pathname === "/proyectos"
                    ? "bg-[#1a2236] text-white"
                    : "text-text-secondary hover:text-white hover:bg-white/5"
                }`}
              >
                <Kanban
                  className={`h-4.5 w-4.5 ${pathname === "/proyectos" ? "text-[#7c6fe0]" : ""}`}
                />
                <span>Proyectos</span>
              </Link>

              <div className="py-2">
                <div className="h-px bg-white/5 mx-2 my-1" />
              </div>

              <button
                onClick={() => setDrawerOpen(true)}
                className="w-full flex items-center justify-between px-3 py-2 text-text-secondary hover:text-white rounded-lg text-xs font-semibold hover:bg-white/5 transition-all duration-150 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Lightbulb className="h-4.5 w-4.5" />
                  <span>Ideas</span>
                </div>
                {vault.length > 0 && (
                  <span className="px-2 py-0.5 bg-[#d4a06a]/10 border border-[#d4a06a]/20 text-[#d4a06a] rounded-full text-[10px] font-mono font-bold">
                    {vault.length}
                  </span>
                )}
              </button>
              <Link
                href="/historial"
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  pathname === "/historial"
                    ? "bg-[#1a2236] text-white"
                    : "text-text-secondary hover:text-white hover:bg-white/5"
                }`}
              >
                <History
                  className={`h-4.5 w-4.5 ${pathname === "/historial" ? "text-[#7c6fe0]" : ""}`}
                />
                <span>Historial</span>
              </Link>
            </nav>
          </div>
        </aside>

        {/* MAIN CONTAINER */}
        <div className="flex-1 flex flex-col min-w-0 md:ml-[220px]">
          {/* TOPBAR */}
          <header className="h-16 border-b border-white/5 bg-[#111827] flex items-center justify-between px-6 select-none shrink-0 z-40">
            <div className="flex items-center gap-3">
              {/* Pulsing logo */}
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7c6fe0] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#7c6fe0]"></span>
                </span>
                <span className="text-md font-bold tracking-tight text-white font-sans">
                  Pragma
                </span>
              </div>
            </div>

            {/* Current Date Monospace */}
            <div className="font-mono text-xs text-text-secondary uppercase tracking-wider bg-[#0a0e1a] px-3.5 py-1.5 rounded-full border border-white/5">
              {getFormattedDate()}
            </div>

            {/* Notifications & LogOut area */}
            <div className="flex items-center gap-3">
              {/* Notification Bell Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                  title="Recordatorios"
                  className="relative flex items-center justify-center h-8 w-8 rounded-full border border-white/5 hover:border-white/12 bg-[#1a2236] text-text-secondary hover:text-white transition-all duration-150 cursor-pointer"
                >
                  <Bell className="h-3.5 w-3.5" />
                  {activeNotifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center bg-red-500 text-white rounded-full text-[9px] font-bold font-mono">
                      {activeNotifications.length}
                    </span>
                  )}
                </button>

                {/* Dropdown Menu */}
                {notifDropdownOpen && (
                  <>
                    {/* Backdrop to close dropdown on click outside */}
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setNotifDropdownOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-80 bg-[#111827] border border-white/5 rounded-xl shadow-2xl p-4 z-50 flex flex-col gap-3 max-h-96 overflow-y-auto">
                      <div className="flex items-center justify-between border-b border-white/5 pb-2">
                        <span className="text-xs font-bold text-white">Recordatorios</span>
                        {activeNotifications.length > 0 && (
                          <button
                            onClick={() => {
                              markAllNotificationsAsRead();
                              setNotifDropdownOpen(false);
                            }}
                            className="text-[10px] text-[#7c6fe0] hover:underline cursor-pointer font-semibold"
                          >
                            Archivar todos
                          </button>
                        )}
                      </div>

                      {activeNotifications.length === 0 ? (
                        <div className="text-center py-6 text-text-hint text-xs">
                          No tienes recordatorios pendientes.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2.5">
                          {activeNotifications.map((notif) => (
                            <div 
                              key={notif.id}
                              className="bg-[#1a2236]/60 border border-white/5 rounded-lg p-2.5 flex items-start justify-between gap-3 group/notif"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-white leading-normal break-words">
                                  {notif.label}
                                </p>
                                <span className="text-[9px] text-text-hint font-mono mt-1 block">
                                  {notif.eventDate} @ {notif.eventTime.split(" - ")[0]}
                                </span>
                              </div>
                              <button
                                onClick={() => markNotificationAsRead(notif.id)}
                                title="Archivar recordatorio"
                                className="text-text-hint hover:text-[#2dd4a0] p-1 rounded hover:bg-white/5 transition-colors cursor-pointer shrink-0"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Avatar discreto / LogOut */}
              <button
                onClick={() => pragmaDb.signOut()}
                title="Cerrar sesión"
                className="flex items-center justify-center h-8 w-8 rounded-full border border-white/5 hover:border-white/12 bg-[#1a2236] text-text-secondary hover:text-white transition-all duration-150 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </header>

          {/* PAGE CONTENT */}
          <main className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">{children}</main>

          {/* MOBILE BOTTOM NAVIGATION BAR */}
          <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#111827] border-t border-white/5 flex items-center justify-around px-4 z-40 select-none">
            <Link
              href="/hoy"
              className={`flex flex-col items-center gap-1 ${
                pathname === "/hoy" ? "text-[#7c6fe0]" : "text-text-secondary"
              }`}
            >
              <Calendar className="h-4.5 w-4.5" />
              <span className="text-[9px] font-medium">Hoy</span>
            </Link>
            <Link
              href="/enfoque"
              className={`flex flex-col items-center gap-1 ${
                pathname === "/enfoque" ? "text-[#7c6fe0]" : "text-text-secondary"
              }`}
            >
              <Target className="h-4.5 w-4.5" />
              <span className="text-[9px] font-medium">Enfoque</span>
            </Link>
            <Link
              href="/proyectos"
              className={`flex flex-col items-center gap-1 ${
                pathname === "/proyectos" ? "text-[#7c6fe0]" : "text-text-secondary"
              }`}
            >
              <Kanban className="h-4.5 w-4.5" />
              <span className="text-[9px] font-medium">Proyectos</span>
            </Link>
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex flex-col items-center gap-1 text-text-secondary relative cursor-pointer"
            >
              <Lightbulb className="h-4.5 w-4.5" />
              <span className="text-[9px] font-medium">Ideas</span>
              {vault.length > 0 && (
                <span className="absolute -top-1 right-2 h-3.5 min-w-3.5 flex items-center justify-center bg-[#d4a06a] text-[#0a0e1a] rounded-full text-[8px] font-bold px-1 scale-85">
                  {vault.length}
                </span>
              )}
            </button>
            <Link
              href="/historial"
              className={`flex flex-col items-center gap-1 ${
                pathname === "/historial" ? "text-[#7c6fe0]" : "text-text-secondary"
              }`}
            >
              <History className="h-4.5 w-4.5" />
              <span className="text-[9px] font-medium">Historial</span>
            </Link>
          </nav>
        </div>

        {/* DRAWER — IDEAS / BÓVEDA (Slide-over from right) */}
        <div
          className={`fixed inset-0 z-50 overflow-hidden select-none ${
            drawerOpen ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          {/* Backdrop overlay */}
          <div
            className={`absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300 ${
              drawerOpen ? "opacity-100" : "opacity-0"
            }`}
            onClick={() => setDrawerOpen(false)}
          />

          <div className="absolute inset-y-0 right-0 max-w-full flex">
            <div
              className={`w-[85vw] sm:w-[400px] bg-[#111827] border-l border-white/5 shadow-2xl flex flex-col h-full transform transition-transform duration-300 ease-in-out ${
                drawerOpen ? "translate-x-0" : "translate-x-full"
              }`}
            >
              {/* Header */}
              <div className="h-16 px-6 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4.5 w-4.5 text-[#d4a06a]" />
                  <span className="text-sm font-semibold text-white">Bóveda de Ideas</span>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="text-text-secondary hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* List scrollable container */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {vault.length === 0 ? (
                  <div className="text-center py-10 text-text-hint text-sm">
                    La bóveda está vacía. Guarda ideas desde tu brain dump o añade una abajo.
                  </div>
                ) : (
                  vault.map((idea, idx) => (
                    <div
                      key={idea.id || idx}
                      className={`bg-[#1a2236] border border-white/5 rounded-lg p-4 flex flex-col gap-2 group relative hover:border-white/12 transition-all ${
                        idea.status === "completed" ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Status Toggle Checkbox */}
                        <button
                          onClick={() => handleToggleIdeaStatus(idea.id)}
                          title={idea.status === "completed" ? "Marcar como pendiente" : "Marcar como cumplida"}
                          className="mt-0.5 shrink-0 text-text-secondary hover:text-[#2dd4a0] cursor-pointer transition-colors duration-150"
                        >
                          {idea.status === "completed" ? (
                            <CheckCircle2 className="h-4.5 w-4.5 text-[#2dd4a0] fill-[#2dd4a0]/10" />
                          ) : (
                            <Circle className="h-4.5 w-4.5" />
                          )}
                        </button>

                        <div
                          className={`text-sm text-text-primary pr-6 leading-normal break-words ${
                            idea.status === "completed" ? "line-through text-text-secondary decoration-white/10" : ""
                          }`}
                        >
                          {idea.text}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-text-secondary font-mono pl-7.5">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 bg-[#d4a06a]/10 border border-[#d4a06a]/20 text-[#d4a06a] rounded-sm">
                            {idea.tag}
                          </span>
                          {idea.status === "completed" && (
                            <span className="text-[10px] text-[#2dd4a0] uppercase font-bold tracking-wider">
                              Cumplida
                            </span>
                          )}
                        </div>
                        <span>{idea.created_at}</span>
                      </div>

                      {/* Delete button */}
                      <button
                        onClick={() => handleDeleteIdea(idea.id)}
                        title="Eliminar idea"
                        className="absolute top-3 right-3 text-text-hint hover:text-red-400 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Bottom drawer Input footer */}
              <div className="p-4 border-t border-white/5 bg-[#111827]">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newIdeaText}
                    onChange={(e) => setNewIdeaText(e.target.value)}
                    placeholder="Nueva idea rápida..."
                    onKeyDown={(e) => e.key === "Enter" && handleAddManualIdea()}
                    className="flex-1 bg-[#0a0e1a] border border-white/5 hover:border-white/10 focus:border-[#7c6fe0]/40 text-text-primary text-xs rounded-lg px-3 py-2 focus:outline-hidden transition-all placeholder-text-hint"
                  />
                  <button
                    onClick={handleAddManualIdea}
                    className="flex items-center justify-center p-2 bg-[#7c6fe0] hover:bg-[#685ad8] text-white rounded-lg transition-colors cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Global Toast Banner */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 bg-[#1a2236] border border-white/10 text-text-primary text-xs font-semibold rounded-lg shadow-xl animate-fade-in flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7c6fe0] animate-pulse"></span>
            {toast}
          </div>
        )}
      </div>
    </AppLayoutContext.Provider>
  );
}
