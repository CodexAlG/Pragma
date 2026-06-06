"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { pragmaDb, TimelineItem, VaultItem, DayData } from "../../lib/supabase";
import { detectFlags, parseBrainDump, calculateEffort, autoTagIdea } from "../../lib/parser";
import {
  Calendar,
  Target,
  Kanban,
  Lightbulb,
  History,
  Sparkles,
  CheckCircle2,
  Circle,
  Trash2,
  Plus,
  X,
  LogOut,
  HelpCircle,
  Menu,
} from "lucide-react";

export default function HoyPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Form State
  const [rawText, setRawText] = useState("");
  const [flags, setFlags] = useState<string[]>([]);
  const [contextAnswers, setContextAnswers] = useState<Record<string, any>>({
    branch_or_pr: "",
    meeting_time: "",
    bug_duration: "",
    save_to_vault: false,
  });

  // Timeline & Vault state
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [vault, setVault] = useState<VaultItem[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [effortDist, setEffortDist] = useState({ dev: 0, meeting: 0, idea: 0 });

  // Drawer / Navigation state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newIdeaText, setNewIdeaText] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch initial profile
  useEffect(() => {
    async function loadSession() {
      const activeUser = await pragmaDb.getUser();
      if (!activeUser) {
        router.push("/login");
        return;
      }
      setUser(activeUser);

      const profile = await pragmaDb.getProfile();
      if (profile && profile.day_data) {
        const dd = profile.day_data;
        if (dd.current_day) {
          // If profile has saved day data, load it
          setRawText(dd.current_day.raw_text || "");
          setFlags(dd.current_day.flags || []);
          setContextAnswers({
            branch_or_pr: "",
            meeting_time: "",
            bug_duration: "",
            save_to_vault: false,
            ...(dd.current_day.context_answers || {}),
          });
          setTimeline(dd.current_day.timeline || []);
          if (dd.current_day.timeline && dd.current_day.timeline.length > 0) {
            setShowResults(true);
            setEffortDist(calculateEffort(dd.current_day.timeline));
          }
        }
        setVault(dd.vault || []);
      }
      setLoading(false);
    }
    loadSession();
  }, [router]);

  // Handle auto-resize of brain dump textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.max(80, textareaRef.current.scrollHeight)}px`;
    }
  }, [rawText]);

  // Parse flags on text change
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setRawText(text);
    setFlags(detectFlags(text));
  };

  // Helper to show a temporary Toast
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3000);
  };

  // Orquestar mi día submission
  const handleOrchestrate = async () => {
    if (!rawText.trim()) return;

    // Parse timeline
    const parsedTimeline = parseBrainDump(rawText, contextAnswers);

    // Atomic vault save if checkbox checked
    let updatedVault = [...vault];
    if (contextAnswers.save_to_vault) {
      // Find ideas sentences
      const sentences = rawText.split(/[.;\n]+/).map(s => s.trim());
      let ideaSentences = sentences.filter(s =>
        ["idea", "pensar en", "explorar"].some(k => s.toLowerCase().includes(k))
      );
      if (ideaSentences.length === 0) {
        ideaSentences = [rawText];
      }

      ideaSentences.forEach((ideaText, i) => {
        // Clean text of "IDEA:" headers
        const cleanedText = ideaText.replace(/^idea\s*[:\-]?\s*/i, "").trim();
        if (cleanedText.length > 3) {
          // Check if already in vault
          const exists = updatedVault.some(v => v.text.toLowerCase() === cleanedText.toLowerCase());
          if (!exists) {
            updatedVault.push({
              id: `${Date.now()}-vault-${i}`,
              text: cleanedText,
              tag: autoTagIdea(cleanedText),
              created_at: new Date().toISOString().split("T")[0],
              status: "pending",
            });
          }
        }
      });
    }

    setTimeline(parsedTimeline);
    setVault(updatedVault);
    setShowResults(true);

    const efforts = calculateEffort(parsedTimeline);
    setEffortDist(efforts);

    // Persist to DB/localStorage
    const dayDataPayload: DayData = {
      current_day: {
        date: new Date().toISOString().split("T")[0],
        raw_text: rawText,
        flags,
        context_answers: contextAnswers,
        timeline: parsedTimeline,
      },
      vault: updatedVault,
    };

    const success = await pragmaDb.updateDayData(dayDataPayload);
    if (success) {
      triggerToast("¡Tu día ha sido orquestado y guardado!");
    } else {
      triggerToast("Error al guardar en el servidor.");
    }
  };

  // Toggle single timeline item status
  const handleToggleTimelineItem = async (itemId: string) => {
    const updated = timeline.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          status: item.status === "done" ? ("pending" as const) : ("done" as const),
        };
      }
      return item;
    });

    setTimeline(updated);

    const dayDataPayload: DayData = {
      current_day: {
        date: new Date().toISOString().split("T")[0],
        raw_text: rawText,
        flags,
        context_answers: contextAnswers,
        timeline: updated,
      },
      vault,
    };

    await pragmaDb.updateDayData(dayDataPayload);
  };

  // Add idea manually via drawer
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
    setVault(updatedVault);
    setNewIdeaText("");

    const dayDataPayload: DayData = {
      current_day: timeline.length > 0 ? {
        date: new Date().toISOString().split("T")[0],
        raw_text: rawText,
        flags,
        context_answers: contextAnswers,
        timeline,
      } : undefined,
      vault: updatedVault,
    };

    const success = await pragmaDb.updateDayData(dayDataPayload);
    if (success) {
      triggerToast("Idea guardada en la bóveda.");
    }
  };

  // Delete idea from drawer
  const handleDeleteIdea = async (ideaId: string) => {
    const updatedVault = vault.filter(v => v.id !== ideaId);
    setVault(updatedVault);

    const dayDataPayload: DayData = {
      current_day: timeline.length > 0 ? {
        date: new Date().toISOString().split("T")[0],
        raw_text: rawText,
        flags,
        context_answers: contextAnswers,
        timeline,
      } : undefined,
      vault: updatedVault,
    };

    await pragmaDb.updateDayData(dayDataPayload);
    triggerToast("Idea eliminada de la bóveda.");
  };

  // Toggle idea completion status in drawer
  const handleToggleIdeaStatus = async (ideaId: string) => {
    const updatedVault = vault.map(v => {
      if (v.id === ideaId) {
        return {
          ...v,
          status: v.status === "completed" ? ("pending" as const) : ("completed" as const),
        };
      }
      return v;
    });
    setVault(updatedVault);

    const dayDataPayload: DayData = {
      current_day: timeline.length > 0 ? {
        date: new Date().toISOString().split("T")[0],
        raw_text: rawText,
        flags,
        context_answers: contextAnswers,
        timeline,
      } : undefined,
      vault: updatedVault,
    };

    await pragmaDb.updateDayData(dayDataPayload);
  };

  // Date formatted in Mono
  const getFormattedDate = () => {
    const d = new Date();
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return `${days[d.getDay()]}, ${d.getDate().toString().padStart(2, "0")} ${months[d.getMonth()]}`;
  };

  // Calculate Progress values
  const totalTasks = timeline.filter(t => t.type !== "idea");
  const completedTasks = totalTasks.filter(t => t.status === "done");
  const progressPercent = totalTasks.length > 0 ? (completedTasks.length / totalTasks.length) * 100 : 0;

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#0a0e1a] text-text-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#7c6fe0] border-t-transparent"></div>
          <span className="font-mono text-xs text-text-secondary tracking-widest">CARGANDO PRAGMA</span>
        </div>
      </div>
    );
  }

  // Check if specific flags are present in the text input
  const showDevQuestion = flags.includes("dev") || rawText.toLowerCase().includes("pr") || rawText.toLowerCase().includes("branch") || rawText.toLowerCase().includes("código");
  const showMeetingQuestion = flags.includes("meeting") || rawText.toLowerCase().includes("reunión") || rawText.toLowerCase().includes("meeting");
  const showBugQuestion = rawText.toLowerCase().includes("bug") || rawText.toLowerCase().includes("fix");
  const showIdeaQuestion = flags.includes("idea") || rawText.toLowerCase().includes("idea");

  return (
    <div className="min-h-screen flex bg-[#0a0e1a] text-text-primary overflow-x-hidden font-sans">
      {/* SIDEBAR - Desktop (Fixed 220px) */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-screen w-[220px] bg-[#111827] border-r border-white/5 select-none shrink-0 z-30">
        <div className="flex flex-col flex-1 py-6">
          <nav className="space-y-1.5 px-4">
            <a
              href="#"
              className="flex items-center gap-3 px-3 py-2 bg-[#1a2236] text-white rounded-lg text-xs font-semibold transition-all duration-150"
            >
              <Calendar className="h-4.5 w-4.5 text-[#7c6fe0]" />
              <span>Hoy</span>
            </a>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                triggerToast("Enfoque estará disponible en la próxima versión.");
              }}
              className="flex items-center gap-3 px-3 py-2 text-text-secondary hover:text-white rounded-lg text-xs font-semibold hover:bg-white/5 transition-all duration-150"
            >
              <Target className="h-4.5 w-4.5" />
              <span>Enfoque</span>
            </a>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                triggerToast("Proyectos estará disponible en la próxima versión.");
              }}
              className="flex items-center gap-3 px-3 py-2 text-text-secondary hover:text-white rounded-lg text-xs font-semibold hover:bg-white/5 transition-all duration-150"
            >
              <Kanban className="h-4.5 w-4.5" />
              <span>Proyectos</span>
            </a>

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
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                triggerToast("Historial estará disponible en la próxima versión.");
              }}
              className="flex items-center gap-3 px-3 py-2 text-text-secondary hover:text-white rounded-lg text-xs font-semibold hover:bg-white/5 transition-all duration-150"
            >
              <History className="h-4.5 w-4.5" />
              <span>Historial</span>
            </a>
          </nav>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-[220px]">
        {/* TOPBAR */}
        <header className="h-16 border-b border-white/5 bg-[#111827] flex items-center justify-between px-6 select-none shrink-0 z-40">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Icon */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-text-secondary hover:text-white mr-1 cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>

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

          {/* Avatar discreto / LogOut */}
          <button
            onClick={() => pragmaDb.signOut()}
            title="Cerrar sesión"
            className="flex items-center justify-center h-8 w-8 rounded-full border border-white/5 hover:border-white/12 bg-[#1a2236] text-text-secondary hover:text-white transition-all duration-150 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </header>

        {/* MOBILE NAVIGATION SIDEBAR MENU */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            {/* Overlay */}
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Sidebar drawer content */}
            <div className="relative flex flex-col w-[240px] bg-[#111827] h-full p-6 border-r border-white/5">
              <div className="flex items-center justify-between mb-8">
                <span className="font-bold text-white">Navegación</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-text-secondary hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="space-y-4">
                <a
                  href="#"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 text-text-primary"
                >
                  <Calendar className="h-4.5 w-4.5 text-[#7c6fe0]" />
                  <span className="text-sm font-medium">Hoy</span>
                </a>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setMobileMenuOpen(false);
                    triggerToast("Enfoque próximamente.");
                  }}
                  className="flex items-center gap-3 text-text-secondary hover:text-white"
                >
                  <Target className="h-4.5 w-4.5" />
                  <span className="text-sm font-medium">Enfoque</span>
                </a>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setMobileMenuOpen(false);
                    triggerToast("Proyectos próximamente.");
                  }}
                  className="flex items-center gap-3 text-text-secondary hover:text-white"
                >
                  <Kanban className="h-4.5 w-4.5" />
                  <span className="text-sm font-medium">Proyectos</span>
                </a>

                <div className="h-px bg-white/5 my-2" />

                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setDrawerOpen(true);
                  }}
                  className="w-full flex items-center justify-between text-text-secondary hover:text-white"
                >
                  <div className="flex items-center gap-3">
                    <Lightbulb className="h-4.5 w-4.5" />
                    <span className="text-sm font-medium">Ideas</span>
                  </div>
                  {vault.length > 0 && (
                    <span className="px-2 py-0.5 bg-[#d4a06a]/10 border border-[#d4a06a]/20 text-[#d4a06a] rounded-full text-[10px] font-mono font-bold">
                      {vault.length}
                    </span>
                  )}
                </button>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setMobileMenuOpen(false);
                    triggerToast("Historial próximamente.");
                  }}
                  className="flex items-center gap-3 text-text-secondary hover:text-white"
                >
                  <History className="h-4.5 w-4.5" />
                  <span className="text-sm font-medium">Historial</span>
                </a>
              </nav>
            </div>
          </div>
        )}

        {/* WORK AREA SCROLLER */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8">
          {/* SECTION SUPERIOR — INPUT */}
          <section className="bg-[#111827] border border-white/5 rounded-xl p-5 md:p-6 space-y-5 shadow-xl">
            <div className="flex flex-col gap-2">
              <textarea
                ref={textareaRef}
                value={rawText}
                onChange={handleTextChange}
                placeholder="Vuelca tu día aquí..."
                className="w-full bg-transparent border-0 text-text-primary placeholder-text-hint text-base font-sans resize-none focus:ring-0 focus:outline-hidden p-0 min-h-[80px]"
              />

              {/* Real-time Flag Chips */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                {flags.includes("dev") && (
                  <span className="inline-flex items-center px-2.5 py-1 bg-[#7c6fe0]/10 border border-[#7c6fe0]/20 text-[#7c6fe0] rounded-md text-xs font-mono select-none">
                    Revisión/Código
                  </span>
                )}
                {flags.includes("meeting") && (
                  <span className="inline-flex items-center px-2.5 py-1 bg-[#7c6fe0]/10 border border-[#7c6fe0]/20 text-[#7c6fe0] rounded-md text-xs font-mono select-none">
                    Gestión/Reunión
                  </span>
                )}
                {flags.includes("idea") && (
                  <span className="inline-flex items-center px-2.5 py-1 bg-[#d4a06a]/10 border border-[#d4a06a]/20 text-[#d4a06a] rounded-md text-xs font-mono select-none">
                    Idea detectada
                  </span>
                )}
                {flags.length === 0 && (
                  <span className="text-xs text-text-hint font-mono select-none py-1">
                    Escribe para auto-detectar tareas...
                  </span>
                )}
              </div>
            </div>

            {/* Context Resolution Cards */}
            {rawText.trim().length > 5 && (showDevQuestion || showMeetingQuestion || showBugQuestion || showIdeaQuestion) && (
              <div className="space-y-3 pt-2">
                <div className="text-[11px] font-mono text-text-secondary uppercase tracking-wider">
                  Resolución de contexto
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Dev / PR Card */}
                  {showDevQuestion && (
                    <div className="bg-[#1a2236] border border-white/5 rounded-lg p-3 flex flex-col gap-2 transition-all">
                      <label className="text-xs text-text-secondary font-medium">
                        ¿Qué rama o PR?
                      </label>
                      <input
                        type="text"
                        value={contextAnswers.branch_or_pr || ""}
                        onChange={(e) =>
                          setContextAnswers({
                            ...contextAnswers,
                            branch_or_pr: e.target.value,
                          })
                        }
                        placeholder="e.g. feature/auth-hooks"
                        className="bg-[#0a0e1a] border border-white/5 rounded px-2.5 py-1.5 text-xs text-text-primary placeholder-text-hint focus:outline-hidden focus:border-[#7c6fe0] focus:ring-1 focus:ring-[#7c6fe0]"
                      />
                    </div>
                  )}

                  {/* Meeting Time Card */}
                  {showMeetingQuestion && (
                    <div className="bg-[#1a2236] border border-white/5 rounded-lg p-3 flex flex-col gap-2 transition-all">
                      <label className="text-xs text-text-secondary font-medium">
                        ¿A qué hora es la reunión?
                      </label>
                      <input
                        type="time"
                        value={contextAnswers.meeting_time || ""}
                        onChange={(e) =>
                          setContextAnswers({
                            ...contextAnswers,
                            meeting_time: e.target.value,
                          })
                        }
                        className="bg-[#0a0e1a] border border-white/5 rounded px-2.5 py-1.5 text-xs text-text-primary focus:outline-hidden focus:border-[#7c6fe0]"
                      />
                    </div>
                  )}

                  {/* Bug duration Card */}
                  {showBugQuestion && (
                    <div className="bg-[#1a2236] border border-white/5 rounded-lg p-3 flex flex-col gap-2 transition-all">
                      <label className="text-xs text-text-secondary font-medium">
                        ¿Duración estimada del bug?
                      </label>
                      <input
                        type="text"
                        value={contextAnswers.bug_duration || ""}
                        onChange={(e) =>
                          setContextAnswers({
                            ...contextAnswers,
                            bug_duration: e.target.value,
                          })
                        }
                        placeholder="e.g. 45 min"
                        className="bg-[#0a0e1a] border border-white/5 rounded px-2.5 py-1.5 text-xs text-text-primary placeholder-text-hint focus:outline-hidden focus:border-[#7c6fe0] focus:ring-1 focus:ring-[#7c6fe0]"
                      />
                    </div>
                  )}

                  {/* Idea vault checkbox Card */}
                  {showIdeaQuestion && (
                    <div className="bg-[#1a2236] border border-white/5 rounded-lg p-3 flex items-center justify-between gap-4 transition-all">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-semibold text-[#d4a06a]">
                          ¿Guardar idea en la bóveda?
                        </span>
                        <span className="text-[10px] text-text-secondary">
                          Se registrará en tus ideas guardadas
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={!!contextAnswers.save_to_vault}
                        onChange={(e) =>
                          setContextAnswers({
                            ...contextAnswers,
                            save_to_vault: e.target.checked,
                          })
                        }
                        className="h-4.5 w-4.5 rounded border-white/10 bg-[#0a0e1a] text-[#d4a06a] focus:ring-0 focus:ring-offset-0 accent-[#d4a06a] cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Orchestrate Button */}
            <button
              onClick={handleOrchestrate}
              disabled={!rawText.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#7c6fe0] hover:bg-[#6c5ecb] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-lg transition-all duration-150 cursor-pointer shadow-lg select-none"
            >
              <Sparkles className="h-4.5 w-4.5" />
              <span>{showResults ? "Re-orquestar" : "Orquestar mi día"}</span>
            </button>
          </section>

          {/* SECTION INFERIOR — RESULTS */}
          {showResults && (
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Effort Distribution Donut (Column: 5/12) */}
              <div className="lg:col-span-5 space-y-6">
                {/* Effort Card */}
                <div className="bg-[#111827] border border-white/5 rounded-xl p-5 shadow-xl space-y-4">
                  <div className="text-xs font-mono text-text-secondary uppercase tracking-wider">
                    Distribución de esfuerzo
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    {/* Pure SVG Donut Chart */}
                    <div className="w-28 h-28 relative flex items-center justify-center shrink-0">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                        {/* Empty/base circle */}
                        <circle
                          cx="18"
                          cy="18"
                          r="15.9155"
                          fill="transparent"
                          stroke="rgba(255,255,255,0.03)"
                          strokeWidth="3.5"
                        />
                        {/* Dev segment (accent-purple #7c6fe0) */}
                        {effortDist.dev > 0 && (
                          <circle
                            cx="18"
                            cy="18"
                            r="15.9155"
                            fill="transparent"
                            stroke="#7c6fe0"
                            strokeWidth="3.5"
                            strokeDasharray={`${effortDist.dev} ${100 - effortDist.dev}`}
                            strokeDashoffset="0"
                            className="transition-all duration-500 ease-out"
                          />
                        )}
                        {/* Meeting segment (accent-teal #2dd4a0) */}
                        {effortDist.meeting > 0 && (
                          <circle
                            cx="18"
                            cy="18"
                            r="15.9155"
                            fill="transparent"
                            stroke="#2dd4a0"
                            strokeWidth="3.5"
                            strokeDasharray={`${effortDist.meeting} ${100 - effortDist.meeting}`}
                            strokeDashoffset={-effortDist.dev}
                            className="transition-all duration-500 ease-out"
                          />
                        )}
                        {/* Idea segment (accent-amber #d4a06a) */}
                        {effortDist.idea > 0 && (
                          <circle
                            cx="18"
                            cy="18"
                            r="15.9155"
                            fill="transparent"
                            stroke="#d4a06a"
                            strokeWidth="3.5"
                            strokeDasharray={`${effortDist.idea} ${100 - effortDist.idea}`}
                            strokeDashoffset={-(effortDist.dev + effortDist.meeting)}
                            className="transition-all duration-500 ease-out"
                          />
                        )}
                      </svg>
                      {/* Center percentage summary */}
                      <div className="absolute inset-0 flex items-center justify-center flex-col select-none">
                        <span className="text-[10px] font-mono text-text-secondary uppercase tracking-wider">
                          Dev
                        </span>
                        <span className="text-xl font-bold text-white tracking-tight">
                          {effortDist.dev}%
                        </span>
                      </div>
                    </div>

                    {/* Chart Legend */}
                    <div className="flex flex-col gap-2.5 w-full">
                      <div className="flex items-center justify-between text-xs font-sans">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[#7c6fe0]" />
                          <span className="text-text-secondary">Desarrollo técnico</span>
                        </div>
                        <span className="font-mono font-bold text-white">{effortDist.dev}%</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-sans">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[#2dd4a0]" />
                          <span className="text-text-secondary">Gestión / Reunión</span>
                        </div>
                        <span className="font-mono font-bold text-white">{effortDist.meeting}%</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-sans">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[#d4a06a]" />
                          <span className="text-text-secondary">Ideas / Bóveda</span>
                        </div>
                        <span className="font-mono font-bold text-white">{effortDist.idea}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Progress Card */}
                {totalTasks.length > 0 && (
                  <div className="bg-[#111827] border border-white/5 rounded-xl p-5 shadow-xl space-y-3.5 select-none">
                    <div className="flex justify-between items-center text-xs font-sans">
                      <span className="text-text-secondary">Progreso del día</span>
                      <span className="font-mono text-white">
                        {completedTasks.length} / {totalTasks.length} Completado
                      </span>
                    </div>

                    {/* Outer Progress line */}
                    <div className="h-1.5 w-full bg-[#0a0e1a] rounded-full overflow-hidden">
                      <div
                        style={{ width: `${progressPercent}%` }}
                        className="h-full bg-[#2dd4a0] rounded-full transition-all duration-300 ease-out"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Agenda Timeline (Column: 7/12) */}
              <div className="lg:col-span-7 bg-[#111827] border border-white/5 rounded-xl p-5 md:p-6 shadow-xl space-y-4">
                <div className="text-xs font-mono text-text-secondary uppercase tracking-wider">
                  Agenda orquestada
                </div>

                {timeline.length === 0 ? (
                  <div className="text-sm text-text-hint py-6 text-center">
                    No hay tareas en el timeline de hoy.
                  </div>
                ) : (
                  <div className="relative pl-6 space-y-4 pt-1">
                    {/* Left vertical timeline line */}
                    <div className="absolute left-[9px] top-3 bottom-3 w-px bg-white/5" />

                    {timeline.map((item, index) => {
                      const isCompleted = item.status === "done";
                      const isIdea = item.type === "idea";

                      return (
                        <div
                          key={item.id || index}
                          className={`relative flex items-start gap-4 p-3 rounded-lg border transition-all ${
                            isCompleted
                              ? "bg-white/[0.01] border-white/5 opacity-60"
                              : isIdea
                              ? "bg-[#d4a06a]/[0.02] border-[#d4a06a]/10"
                              : "bg-[#1a2236]/30 border-white/5 hover:border-white/12"
                          }`}
                        >
                          {/* Left icon element */}
                          <div className="mt-0.5 shrink-0 select-none z-10 cursor-pointer">
                            {isIdea ? (
                              <Lightbulb className="h-4.5 w-4.5 text-[#d4a06a] fill-[#d4a06a]/20" />
                            ) : isCompleted ? (
                              <CheckCircle2
                                onClick={() => handleToggleTimelineItem(item.id)}
                                className="h-4.5 w-4.5 text-[#2dd4a0] fill-[#2dd4a0]/10 hover:opacity-85"
                              />
                            ) : (
                              <Circle
                                onClick={() => handleToggleTimelineItem(item.id)}
                                className="h-4.5 w-4.5 text-text-secondary hover:text-[#7c6fe0]"
                              />
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                            <div className="flex items-baseline gap-2.5 flex-wrap">
                              {item.time && (
                                <span className={`font-mono text-xs ${
                                  isCompleted ? "text-text-hint" : isIdea ? "text-[#d4a06a]" : "text-[#7c6fe0]"
                                }`}>
                                  {item.time}
                                </span>
                              )}
                              <h4
                                className={`text-sm font-medium leading-tight break-words ${
                                  isCompleted
                                    ? "text-text-secondary line-through decoration-white/10"
                                    : "text-white"
                                }`}
                              >
                                {item.title}
                              </h4>
                            </div>

                            {/* Badges */}
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-sm ${
                                item.type === "dev"
                                  ? "bg-[#7c6fe0]/10 text-[#7c6fe0]"
                                  : item.type === "bug"
                                  ? "bg-red-500/10 text-red-400"
                                  : item.type === "meeting"
                                  ? "bg-blue-500/10 text-blue-400"
                                  : item.type === "client"
                                  ? "bg-[#2dd4a0]/10 text-[#2dd4a0]"
                                  : "bg-[#d4a06a]/10 text-[#d4a06a]"
                              }`}>
                                {item.type === "dev"
                                  ? "Desarrollo"
                                  : item.type === "bug"
                                  ? "Bug"
                                  : item.type === "meeting"
                                  ? "Reunión"
                                  : item.type === "client"
                                  ? "Cliente"
                                  : "Idea"}
                              </span>
                              {isCompleted && (
                                <span className="text-[10px] font-mono uppercase text-[#2dd4a0]">
                                  Completado
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}
        </main>

        {/* MOBILE BOTTOM NAVIGATION BAR */}
        <nav className="md:hidden h-16 bg-[#111827] border-t border-white/5 flex items-center justify-around shrink-0 z-40 select-none">
          <a
            href="#"
            className="flex flex-col items-center gap-1 text-white"
          >
            <Calendar className="h-4.5 w-4.5 text-[#7c6fe0]" />
            <span className="text-[9px] font-medium">Hoy</span>
          </a>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              triggerToast("Enfoque próximamente.");
            }}
            className="flex flex-col items-center gap-1 text-text-secondary"
          >
            <Target className="h-4.5 w-4.5" />
            <span className="text-[9px] font-medium">Enfoque</span>
          </a>
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex flex-col items-center gap-1 text-text-secondary relative"
          >
            <Lightbulb className="h-4.5 w-4.5" />
            <span className="text-[9px] font-medium">Ideas</span>
            {vault.length > 0 && (
              <span className="absolute -top-1 right-2 h-3.5 min-w-3.5 flex items-center justify-center bg-[#d4a06a] text-[#0a0e1a] rounded-full text-[8px] font-bold px-1 scale-85">
                {vault.length}
              </span>
            )}
          </button>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              triggerToast("Historial próximamente.");
            }}
            className="flex flex-col items-center gap-1 text-text-secondary"
          >
            <History className="h-4.5 w-4.5" />
            <span className="text-[9px] font-medium">Historial</span>
          </a>
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

        <div className="absolute inset-y-0 right-0 pl-10 max-w-full flex">
          <div
            className={`w-screen max-w-md bg-[#111827] border-l border-white/5 shadow-2xl flex flex-col h-full transform transition-transform duration-300 ease-in-out ${
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

                    {/* Delete button (hover showing) */}
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

            {/* Footer Input Area for manual ideas */}
            <div className="p-6 border-t border-white/5 bg-[#1a2236]/30 space-y-3">
              <div className="flex flex-col gap-1.5">
                <input
                  type="text"
                  value={newIdeaText}
                  onChange={(e) => setNewIdeaText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddManualIdea();
                  }}
                  placeholder="Nueva idea..."
                  className="w-full bg-[#0a0e1a] border border-white/5 rounded px-3 py-2 text-xs text-text-primary placeholder-text-hint focus:outline-hidden focus:border-[#d4a06a]"
                />
              </div>
              <button
                onClick={handleAddManualIdea}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-[#d4a06a] hover:bg-[#c29158] text-[#0a0e1a] font-bold text-xs rounded transition-colors duration-150 cursor-pointer select-none"
              >
                <Plus className="h-3.5 w-3.5 stroke-[3px]" />
                <span>Nueva idea</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Global Toast */}
      {toastMessage && (
        <div className="fixed bottom-20 md:bottom-8 right-1/2 translate-x-1/2 md:translate-x-0 md:right-8 bg-[#111827] border border-white/10 text-white font-mono text-xs px-4 py-3 rounded-lg shadow-2xl z-50 flex items-center gap-2 select-none">
          <span className="h-1.5 w-1.5 rounded-full bg-[#7c6fe0] animate-pulse"></span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
