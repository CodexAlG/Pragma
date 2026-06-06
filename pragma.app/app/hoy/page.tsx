"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { pragmaDb, TimelineItem, VaultItem, DayData, HistoryItem } from "../../lib/supabase";
import { detectFlags, parseBrainDump, calculateEffort, autoTagIdea, parseAgendarLine, detectCategoryFromText } from "../../lib/parser";
import { useAppLayout } from "../../components/AppLayout";
import {
  Sparkles,
  CheckCircle2,
  Circle,
  HelpCircle,
  Lightbulb,
  Calendar,
  X,
  Trash2,
} from "lucide-react";

export default function HoyPage() {
  const router = useRouter();
  const { dayData, updateDayData, triggerToast, vault } = useAppLayout();

  // Form State
  const [rawText, setRawText] = useState("");
  const [flags, setFlags] = useState<string[]>([]);
  const [contextAnswers, setContextAnswers] = useState<Record<string, any>>({
    branch_or_pr: "",
    meeting_time: "",
    bug_duration: "",
    save_to_vault: false,
  });

  // Visual Schedule Modal State
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [schedDate, setSchedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [schedTitle, setSchedTitle] = useState("");
  const [schedType, setSchedType] = useState<TimelineItem["type"]>("meeting");
  const [schedStart, setSchedStart] = useState("09:00");
  const [schedEnd, setSchedEnd] = useState("10:00");

  // Timeline state
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [effortDist, setEffortDist] = useState({ dev: 0, meeting: 0, idea: 0 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Inline editing state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingTime, setEditingTime] = useState("");
  const [editingType, setEditingType] = useState<TimelineItem["type"]>("dev");

  const handleStartEdit = (item: TimelineItem) => {
    setEditingItemId(item.id);
    setEditingTitle(item.title);
    setEditingTime(item.time);
    setEditingType(item.type);
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
  };

  const handleSaveInlineEdit = async (itemId: string) => {
    if (!editingTitle.trim()) {
      triggerToast("La descripción no puede estar vacía.");
      return;
    }

    const updatedTimeline = timeline.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          title: editingTitle.trim(),
          time: editingTime.trim(),
          type: editingType,
        };
      }
      return item;
    });

    updatedTimeline.sort((a, b) => a.time.localeCompare(b.time));
    setTimeline(updatedTimeline);
    setEditingItemId(null);

    const todayStr = new Date().toISOString().split("T")[0];
    let updatedHistory = [...(dayData?.history || [])];

    // Double sync to history
    updatedHistory = updatedHistory.filter(h => h.date !== todayStr);
    updatedHistory.push({
      date: todayStr,
      timeline: updatedTimeline,
      effort_distribution: calculateEffort(updatedTimeline),
    });

    const dayDataPayload: DayData = {
      ...dayData,
      current_day: {
        ...(dayData?.current_day || { date: todayStr, raw_text: "", flags: [], context_answers: {}, timeline: [] }),
        timeline: updatedTimeline,
      },
      history: updatedHistory,
    };

    const success = await updateDayData(dayDataPayload);
    if (success) {
      triggerToast("Evento actualizado.");
    } else {
      triggerToast("Error al guardar en el servidor.");
    }
  };

  // Delete single timeline item
  const handleDeleteTimelineItem = async (itemId: string) => {
    const updated = timeline.filter(item => item.id !== itemId);
    setTimeline(updated);

    const todayStr = new Date().toISOString().split("T")[0];
    let updatedHistory = [...(dayData?.history || [])];

    // Sync to history as well
    updatedHistory = updatedHistory.filter(h => h.date !== todayStr);
    if (updated.length > 0) {
      updatedHistory.push({
        date: todayStr,
        timeline: updated,
        effort_distribution: calculateEffort(updated),
      });
    }

    const dayDataPayload: DayData = {
      ...dayData,
      current_day: {
        ...(dayData?.current_day || { date: todayStr, raw_text: "", flags: [], context_answers: {}, timeline: [] }),
        timeline: updated,
      },
      history: updatedHistory,
    };

    const success = await updateDayData(dayDataPayload);
    if (success) {
      triggerToast("Evento eliminado.");
    } else {
      triggerToast("Error al guardar en el servidor.");
    }
  };

  // Sync profile data on load & handle rollover
  useEffect(() => {
    if (!dayData) return;

    const todayStr = new Date().toISOString().split("T")[0];
    const currentDayDate = dayData.current_day?.date || "";

    if (currentDayDate && currentDayDate !== todayStr) {
      // Rollover to new day!
      const handleRollover = async () => {
        let updatedHistory = [...(dayData.history || [])];

        // 1. Archive old day to history (if it had a timeline)
        if (dayData.current_day && dayData.current_day.timeline && dayData.current_day.timeline.length > 0) {
          updatedHistory = updatedHistory.filter(h => h.date !== currentDayDate);
          updatedHistory.push({
            date: currentDayDate,
            timeline: dayData.current_day.timeline,
            effort_distribution: calculateEffort(dayData.current_day.timeline),
          });
        }

        // 2. Check if today already has a history entry (scheduled in advance)
        const todayHistoryEntry = updatedHistory.find(h => h.date === todayStr);
        const todayTimeline = todayHistoryEntry ? todayHistoryEntry.timeline : [];

        // 3. Construct new current_day
        const newCurrentDay = {
          date: todayStr,
          raw_text: "",
          flags: [],
          context_answers: {},
          timeline: todayTimeline,
        };

        const dayDataPayload: DayData = {
          ...dayData,
          current_day: newCurrentDay,
          history: updatedHistory,
        };

        await updateDayData(dayDataPayload);
      };

      handleRollover();
    } else if (dayData.current_day) {
      const dd = dayData.current_day;
      setRawText(dd.raw_text || "");
      setFlags(dd.flags || []);
      setContextAnswers({
        branch_or_pr: "",
        meeting_time: "",
        bug_duration: "",
        save_to_vault: false,
        ...(dd.context_answers || {}),
      });
      setTimeline(dd.timeline || []);
      if (dd.timeline && dd.timeline.length > 0) {
        setShowResults(true);
        setEffortDist(calculateEffort(dd.timeline));
      } else {
        setShowResults(false);
      }
    }
  }, [dayData]);

  // Handle auto-resize of brain dump textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.max(80, textareaRef.current.scrollHeight)}px`;
    }
  }, [rawText]);

  // Parse flags on text change and trigger modal on "agendar:"
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setRawText(text);

    // Strip "Agendar:" lines for flags auto-detection
    const activeLines = text.split("\n").filter(line => !line.trim().toLowerCase().startsWith("agendar:"));
    const activeText = activeLines.join("\n");
    setFlags(detectFlags(activeText));

    // Trigger modal if they type "agendar:"
    if (text.toLowerCase().includes("agendar:")) {
      setIsScheduleModalOpen(true);
      // Remove "agendar:" (case-insensitive) to keep text area clean
      const cleanedText = text.replace(/agendar:/i, "");
      setRawText(cleanedText);
    }
  };

  // Orquestar mi día submission
  const handleOrchestrate = async () => {
    if (!rawText.trim()) return;

    const lines = rawText.split("\n");
    // Find all "Agendar:" lines
    const agendarLines = lines.filter(line => line.trim().toLowerCase().startsWith("agendar:"));
    // Filter them out for today's active timeline parsing
    const activeTimelineLines = lines.filter(line => !line.trim().toLowerCase().startsWith("agendar:"));
    const activeTimelineText = activeTimelineLines.join("\n");

    // Parse timeline from today's active text
    const parsedTimeline = parseBrainDump(activeTimelineText, contextAnswers);

    // Atomic vault save if checkbox checked
    let updatedVault = [...vault];
    if (contextAnswers.save_to_vault) {
      const sentences = rawText.split(/[.;\n]+/).map(s => s.trim());
      let ideaSentences = sentences.filter(s =>
        ["idea", "pensar en", "explorar"].some(k => s.toLowerCase().includes(k))
      );
      if (ideaSentences.length === 0) {
        ideaSentences = [rawText];
      }

      ideaSentences.forEach((ideaText, i) => {
        const cleanedText = ideaText.replace(/^idea\s*[:\-]?\s*/i, "").trim();
        if (cleanedText.length > 3) {
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

    // Capture current day to history before overwriting (if it contains data)
    let updatedHistory = [...(dayData?.history || [])];
    if (dayData?.current_day && dayData.current_day.timeline && dayData.current_day.timeline.length > 0) {
      const currentDateStr = dayData.current_day.date || new Date().toISOString().split("T")[0];
      // Keep only one history entry per date to prevent duplicated records if re-orchestrating today
      updatedHistory = updatedHistory.filter(h => h.date !== currentDateStr);

      updatedHistory.push({
        date: currentDateStr,
        timeline: dayData.current_day.timeline,
        effort_distribution: calculateEffort(dayData.current_day.timeline),
      });
    }

    // Process "Agendar:" lines and sync to history
    agendarLines.forEach(line => {
      const parsedEvent = parseAgendarLine(line);
      if (parsedEvent) {
        const newEventItem: TimelineItem = {
          id: `agendar-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          time: parsedEvent.time,
          title: parsedEvent.title,
          type: detectCategoryFromText(parsedEvent.title),
          status: "pending"
        };

        const existingDayIndex = updatedHistory.findIndex(h => h.date === parsedEvent.date);
        if (existingDayIndex !== -1) {
          const dayLog = updatedHistory[existingDayIndex];
          const exists = dayLog.timeline.some(t => t.title.toLowerCase() === newEventItem.title.toLowerCase() && t.time === newEventItem.time);
          if (!exists) {
            const updatedTimeline = [...dayLog.timeline, newEventItem];
            updatedTimeline.sort((a, b) => a.time.localeCompare(b.time));
            updatedHistory[existingDayIndex] = {
              ...dayLog,
              timeline: updatedTimeline,
              effort_distribution: calculateEffort(updatedTimeline)
            };
          }
        } else {
          const newTimeline = [newEventItem];
          updatedHistory.push({
            date: parsedEvent.date,
            timeline: newTimeline,
            effort_distribution: calculateEffort(newTimeline)
          });
        }

        // If parsed date is today, also push to today's active timeline
        const todayStr = new Date().toISOString().split("T")[0];
        if (parsedEvent.date === todayStr) {
          const existsInToday = parsedTimeline.some(t => t.title.toLowerCase() === newEventItem.title.toLowerCase() && t.time === newEventItem.time);
          if (!existsInToday) {
            parsedTimeline.push(newEventItem);
          }
        }
      }
    });

    // Sort active timeline by time
    parsedTimeline.sort((a, b) => a.time.localeCompare(b.time));

    setTimeline(parsedTimeline);
    setShowResults(true);

    const efforts = calculateEffort(parsedTimeline);
    setEffortDist(efforts);

    const dayDataPayload: DayData = {
      ...dayData,
      current_day: {
        date: new Date().toISOString().split("T")[0],
        raw_text: "",
        flags: [],
        context_answers: {},
        timeline: parsedTimeline,
      },
      vault: updatedVault,
      history: updatedHistory,
    };

    const success = await updateDayData(dayDataPayload);
    if (success) {
      triggerToast(dayData?.current_day?.timeline && dayData.current_day.timeline.length > 0 ? "¡Tu día ha sido re-orquestado!" : "¡Tu día ha sido orquestado y guardado!");
      setRawText("");
      setFlags([]);
      setContextAnswers({
        branch_or_pr: "",
        meeting_time: "",
        bug_duration: "",
        save_to_vault: false,
      });
    } else {
      triggerToast("Error al guardar en el servidor.");
    }
  };

  const categories: { value: TimelineItem["type"]; label: string; color: string }[] = [
    { value: "meeting", label: "Reunión", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    { value: "dev", label: "Desarrollo", color: "bg-[#7c6fe0]/10 text-[#7c6fe0] border-[#7c6fe0]/20" },
    { value: "learning", label: "Estudio", color: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
    { value: "idea", label: "Idea", color: "bg-[#d4a06a]/10 text-[#d4a06a] border-[#d4a06a]/20" },
    { value: "personal", label: "Personal", color: "bg-pink-500/10 text-pink-400 border-pink-500/20" },
  ];

  const handleSaveModalSchedule = async () => {
    if (!schedTitle.trim()) {
      triggerToast("Por favor ingresa una descripción para el evento.");
      return;
    }

    let startTime = schedStart || "00:00";
    let endTime = schedEnd || "";

    if (!endTime || endTime === startTime) {
      const [h, m] = startTime.split(":").map(Number);
      const endH = (h + 1) % 24;
      endTime = `${endH.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    }

    const formattedTimeRange = `${startTime} - ${endTime}`;

    const newEventItem: TimelineItem = {
      id: `agendar-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      time: formattedTimeRange,
      title: schedTitle.trim(),
      type: schedType,
      status: "pending"
    };

    let updatedHistory = [...(dayData?.history || [])];
    const existingDayIndex = updatedHistory.findIndex(h => h.date === schedDate);
    if (existingDayIndex !== -1) {
      const dayLog = updatedHistory[existingDayIndex];
      const updatedTimeline = [...dayLog.timeline, newEventItem];
      updatedTimeline.sort((a, b) => a.time.localeCompare(b.time));
      updatedHistory[existingDayIndex] = {
        ...dayLog,
        timeline: updatedTimeline,
        effort_distribution: calculateEffort(updatedTimeline)
      };
    } else {
      const newTimeline = [newEventItem];
      updatedHistory.push({
        date: schedDate,
        timeline: newTimeline,
        effort_distribution: calculateEffort(newTimeline)
      });
    }

    const todayStr = new Date().toISOString().split("T")[0];
    let updatedTodayTimeline = [...timeline];
    if (schedDate === todayStr) {
      const existsInToday = updatedTodayTimeline.some(t => t.title.toLowerCase() === newEventItem.title.toLowerCase() && t.time === newEventItem.time);
      if (!existsInToday) {
        updatedTodayTimeline.push(newEventItem);
        updatedTodayTimeline.sort((a, b) => a.time.localeCompare(b.time));
        setTimeline(updatedTodayTimeline);
      }
    }

    const dayDataPayload: DayData = {
      ...(dayData || {}),
      history: updatedHistory,
    };

    if (schedDate === todayStr) {
      dayDataPayload.current_day = {
        ...(dayData?.current_day || { date: todayStr, raw_text: "", flags: [], context_answers: {}, timeline: [] }),
        date: todayStr,
        raw_text: rawText,
        flags,
        context_answers: contextAnswers,
        timeline: updatedTodayTimeline,
      };
    }

    const success = await updateDayData(dayDataPayload);
    if (success) {
      triggerToast("Evento agendado correctamente.");
      setIsScheduleModalOpen(false);
      setSchedTitle("");
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
      ...dayData,
      current_day: {
        date: new Date().toISOString().split("T")[0],
        raw_text: rawText,
        flags,
        context_answers: contextAnswers,
        timeline: updated,
      },
    };

    await updateDayData(dayDataPayload);
  };

  // Setup resolution logic flags (ignoring Agendar lines)
  const activeText = rawText.split("\n")
    .filter(line => !line.trim().toLowerCase().startsWith("agendar:"))
    .join("\n");

  const showDevQuestion = flags.includes("dev") || activeText.toLowerCase().includes("código") || activeText.toLowerCase().includes("codigo");
  const showMeetingQuestion = flags.includes("meeting") || activeText.toLowerCase().includes("reunión") || activeText.toLowerCase().includes("meeting");
  const showBugQuestion = activeText.toLowerCase().includes("bug") || activeText.toLowerCase().includes("fix");
  const showIdeaQuestion = flags.includes("idea") || activeText.toLowerCase().includes("idea");

  // Calculate Progress values
  const totalTasks = timeline.filter(t => t.type !== "idea");
  const completedTasks = totalTasks.filter(t => t.status === "done");
  const progressPercent = totalTasks.length > 0 ? (completedTasks.length / totalTasks.length) * 100 : 0;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 pb-24 md:pb-8">
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
                Desarrollo/Código
              </span>
            )}
            {flags.includes("meeting") && (
              <span className="inline-flex items-center px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-md text-xs font-mono select-none">
                Gestión/Reunión
              </span>
            )}
            {flags.includes("learning") && (
              <span className="inline-flex items-center px-2.5 py-1 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-md text-xs font-mono select-none">
                Estudio/Aprendizaje
              </span>
            )}
            {flags.includes("idea") && (
              <span className="inline-flex items-center px-2.5 py-1 bg-[#d4a06a]/10 border border-[#d4a06a]/20 text-[#d4a06a] rounded-md text-xs font-mono select-none">
                Idea detectada
              </span>
            )}
            {flags.includes("personal") && (
              <span className="inline-flex items-center px-2.5 py-1 bg-pink-500/10 border border-pink-500/20 text-pink-400 rounded-md text-xs font-mono select-none">
                Asunto Personal
              </span>
            )}
            {flags.length === 0 && (
              <span className="text-xs text-text-hint font-mono select-none py-1 leading-relaxed">
                Palabras clave: <span className="text-text-secondary">reunión/sincro</span> (Gestión), <span className="text-text-secondary">código/pr/bug</span> (Desarrollo), <span className="text-pink-400">personal/casa</span> (Personal), <span className="text-sky-400">curso/estudio</span> (Estudio), <span className="text-[#d4a06a]">idea</span> (Bóveda) o <span className="text-[#7c6fe0]">Agendar: 15 de junio, Cita</span>.
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
                    placeholder="ej. feature/login-page"
                    className="w-full bg-[#0a0e1a] border border-white/5 rounded px-2.5 py-1.5 text-xs text-text-primary focus:outline-hidden focus:border-[#7c6fe0]/40 transition-colors"
                  />
                </div>
              )}

              {/* Meeting Card */}
              {showMeetingQuestion && (
                <div className="bg-[#1a2236] border border-white/5 rounded-lg p-3 flex flex-col gap-2 transition-all">
                  <label className="text-xs text-text-secondary font-medium">
                    ¿A qué hora es la sincronización?
                  </label>
                  <input
                    type="text"
                    value={contextAnswers.meeting_time || ""}
                    onChange={(e) =>
                      setContextAnswers({
                        ...contextAnswers,
                        meeting_time: e.target.value,
                      })
                    }
                    placeholder="ej. 10:00"
                    className="w-full bg-[#0a0e1a] border border-white/5 rounded px-2.5 py-1.5 text-xs text-text-primary focus:outline-hidden focus:border-[#7c6fe0]/40 transition-colors"
                  />
                </div>
              )}

              {/* Bug Card */}
              {showBugQuestion && (
                <div className="bg-[#1a2236] border border-white/5 rounded-lg p-3 flex flex-col gap-2 transition-all">
                  <label className="text-xs text-text-secondary font-medium">
                    ¿Cuánto estimas tardar en el bug?
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
                    placeholder="ej. 45 min"
                    className="w-full bg-[#0a0e1a] border border-white/5 rounded px-2.5 py-1.5 text-xs text-text-primary focus:outline-hidden focus:border-[#7c6fe0]/40 transition-colors"
                  />
                </div>
              )}

              {/* Idea Bóveda Card */}
              {showIdeaQuestion && (
                <div className="bg-[#1a2236] border border-white/5 rounded-lg p-3 flex flex-row items-center gap-3.5 transition-all select-none">
                  <input
                    type="checkbox"
                    id="save_to_vault"
                    checked={contextAnswers.save_to_vault || false}
                    onChange={(e) =>
                      setContextAnswers({
                        ...contextAnswers,
                        save_to_vault: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded-sm border-white/10 bg-[#0a0e1a] text-[#7c6fe0] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <label htmlFor="save_to_vault" className="flex flex-col cursor-pointer">
                    <span className="text-xs text-white font-medium">
                      ¿Guardar idea en la bóveda?
                    </span>
                    <span className="text-[10px] text-text-secondary">
                      Se guardará de forma permanente en Ideas.
                    </span>
                  </label>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2">
          <button
            onClick={handleOrchestrate}
            className="w-full py-3 bg-[#7c6fe0] hover:bg-[#685ad8] text-white text-sm font-semibold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer select-none"
          >
            <Sparkles className="h-4.5 w-4.5" />
            <span>
              {dayData?.current_day?.timeline && dayData.current_day.timeline.length > 0
                ? "Re-orquestar"
                : "Orquestar mi día"}
            </span>
          </button>
        </div>
      </section>

      {/* SECTION INFERIOR — RESULTS */}
      {showResults && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Metrics Block (Column: 5/12) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Donut effort chart */}
            <div className="bg-[#111827] border border-white/5 rounded-xl p-5 md:p-6 shadow-xl flex flex-col items-center space-y-5 select-none">
              <div className="text-xs font-mono text-text-secondary uppercase tracking-wider w-full text-left">
                Distribución de esfuerzo
              </div>

              {/* Pure SVG Donut Chart */}
              <div className="relative h-44 w-44 flex items-center justify-center">
                <svg className="h-full w-full transform -rotate-90" viewBox="0 0 100 100">
                  {/* Background Circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#0a0e1a"
                    strokeWidth="10"
                  />
                  {/* Section 1: Dev (Purple) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#7c6fe0"
                    strokeWidth="10"
                    strokeDasharray={`${effortDist.dev} ${100 - effortDist.dev}`}
                    strokeDashoffset="0"
                  />
                  {/* Section 2: Meeting (Teal) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#2dd4a0"
                    strokeWidth="10"
                    strokeDasharray={`${effortDist.meeting} ${100 - effortDist.meeting}`}
                    strokeDashoffset={-effortDist.dev}
                  />
                  {/* Section 3: Ideas (Amber) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#d4a06a"
                    strokeWidth="10"
                    strokeDasharray={`${effortDist.idea} ${100 - effortDist.idea}`}
                    strokeDashoffset={-(effortDist.dev + effortDist.meeting)}
                  />
                </svg>
                {/* Center text */}
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-bold text-white font-mono leading-none">
                    {timeline.length}
                  </span>
                  <span className="text-[10px] text-text-secondary uppercase tracking-wider mt-1 font-sans">
                    Elementos
                  </span>
                </div>
              </div>

              {/* Legend */}
              <div className="w-full space-y-2 pt-2 border-t border-white/5">
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
                  const isEditing = editingItemId === item.id;
                  const isCompleted = item.status === "done";
                  const isIdea = item.type === "idea";

                  if (isEditing) {
                    return (
                      <div
                        key={item.id || index}
                        className="relative flex flex-col gap-3 p-3 rounded-lg border border-[#7c6fe0]/40 bg-[#1a2236]/80 animate-fade-in"
                      >
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[9px] text-text-secondary font-bold uppercase tracking-wider">Descripción</label>
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            className="w-full bg-[#0a0e1a] border border-white/5 focus:border-[#7c6fe0]/40 rounded-md px-2.5 py-1.5 text-xs text-text-primary focus:outline-hidden"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] text-text-secondary font-bold uppercase tracking-wider">Horario (ej. 14:00 - 15:00 o 14:00)</label>
                            <input
                              type="text"
                              value={editingTime}
                              onChange={(e) => setEditingTime(e.target.value)}
                              className="w-full bg-[#0a0e1a] border border-white/5 focus:border-[#7c6fe0]/40 rounded-md px-2.5 py-1.5 text-xs text-text-primary focus:outline-hidden"
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] text-text-secondary font-bold uppercase tracking-wider">Categoría</label>
                            <select
                              value={editingType}
                              onChange={(e) => setEditingType(e.target.value as any)}
                              className="w-full bg-[#0a0e1a] border border-white/5 focus:border-[#7c6fe0]/40 rounded-md px-2.5 py-1.5 text-xs text-text-primary focus:outline-hidden"
                            >
                              <option value="meeting">Reunión</option>
                              <option value="dev">Desarrollo</option>
                              <option value="learning">Estudio</option>
                              <option value="idea">Idea</option>
                              <option value="personal">Personal</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex gap-2 justify-end pt-1">
                          <button
                            onClick={handleCancelEdit}
                            className="px-2.5 py-1 bg-white/[0.02] hover:bg-white/5 border border-white/5 rounded text-[10px] font-semibold text-text-secondary hover:text-white transition-colors cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleSaveInlineEdit(item.id)}
                            className="px-2.5 py-1 bg-[#7c6fe0] hover:bg-[#685ad8] rounded text-[10px] font-semibold text-white transition-colors cursor-pointer"
                          >
                            Guardar
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.id || index}
                      className={`group relative flex items-start gap-4 p-3 rounded-lg border transition-all ${
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
                      <div
                        onClick={() => handleStartEdit(item)}
                        className="flex-1 min-w-0 flex flex-col gap-0.5 cursor-pointer group/content pr-6"
                      >
                        <div className="flex items-baseline gap-2.5 flex-wrap">
                          {item.time && (
                            <span className={`font-mono text-xs ${
                              isCompleted ? "text-text-hint" : isIdea ? "text-[#d4a06a]" : "text-[#7c6fe0]"
                            }`}>
                              {item.time}
                            </span>
                          )}
                          <h4
                            className={`text-sm font-medium leading-tight break-words flex items-center gap-1.5 ${
                              isCompleted
                                ? "text-text-secondary line-through decoration-white/10"
                                : "text-white"
                            }`}
                          >
                            {item.title}
                            <span className="text-[10px] text-text-hint/40 group-hover/content:text-text-hint transition-colors opacity-0 group-hover/content:opacity-100 font-normal">
                              (editar)
                            </span>
                          </h4>
                        </div>

                        {/* Badges */}
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-sm ${
                            item.type === "dev"
                              ? "bg-[#7c6fe0]/10 text-[#7c6fe0]"
                              : item.type === "meeting"
                              ? "bg-blue-500/10 text-blue-400"
                              : item.type === "learning"
                              ? "bg-sky-500/10 text-sky-400"
                              : item.type === "idea"
                              ? "bg-[#d4a06a]/10 text-[#d4a06a]"
                              : "bg-pink-500/10 text-pink-400"
                          }`}>
                            {item.type === "dev"
                              ? "Desarrollo"
                              : item.type === "meeting"
                              ? "Reunión"
                              : item.type === "learning"
                              ? "Estudio"
                              : item.type === "idea"
                              ? "Idea"
                              : "Personal"}
                          </span>
                          {isCompleted && (
                            <span className="text-[10px] font-mono uppercase text-[#2dd4a0]">
                              Completado
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTimelineItem(item.id);
                        }}
                        title="Eliminar evento"
                        className="absolute top-3 right-3 text-text-hint hover:text-red-400 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* VISUAL SCHEDULING CALENDAR MODAL */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs select-none">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-transparent"
            onClick={() => setIsScheduleModalOpen(false)}
          />

          {/* Modal Container Card */}
          <div className="relative bg-[#111827] border border-white/5 rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden z-10 animate-fade-in">
            {/* Header */}
            <div className="h-16 px-6 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Calendar className="h-4.5 w-4.5 text-[#7c6fe0]" />
                <span className="text-sm font-semibold text-white">Agendar Evento / Nota</span>
              </div>
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="text-text-secondary hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Fields */}
            <div className="p-6 space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">Descripción del Evento</label>
                <input
                  type="text"
                  placeholder="ej. Cumpleaños abuelita"
                  value={schedTitle}
                  onChange={(e) => setSchedTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveModalSchedule()}
                  className="w-full bg-[#0a0e1a] border border-white/5 focus:border-[#7c6fe0]/40 rounded-lg px-3.5 py-2.5 text-xs text-text-primary focus:outline-hidden transition-all placeholder-text-hint"
                />
              </div>
              
              {/* Date picker */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">Fecha</label>
                <input
                  type="date"
                  value={schedDate}
                  onChange={(e) => setSchedDate(e.target.value)}
                  className="w-full bg-[#0a0e1a] border border-white/5 focus:border-[#7c6fe0]/40 rounded-lg px-3.5 py-2.5 text-xs text-text-primary focus:outline-hidden transition-all"
                />
              </div>

              {/* Time and Category Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">Inicio</label>
                  <input
                    type="time"
                    value={schedStart}
                    onChange={(e) => setSchedStart(e.target.value)}
                    className="w-full bg-[#0a0e1a] border border-white/5 focus:border-[#7c6fe0]/40 rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-hidden text-center"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">Fin</label>
                  <input
                    type="time"
                    value={schedEnd}
                    onChange={(e) => setSchedEnd(e.target.value)}
                    className="w-full bg-[#0a0e1a] border border-white/5 focus:border-[#7c6fe0]/40 rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-hidden text-center"
                  />
                </div>
              </div>

              {/* Category chips selector */}
              <div className="flex flex-col gap-2 pt-2">
                <label className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">Categoría</label>
                <div className="grid grid-cols-3 gap-2">
                  {categories.map((cat) => {
                    const isSelected = schedType === cat.value;
                    return (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => setSchedType(cat.value)}
                        className={`px-2 py-2.5 rounded-lg border text-[10px] font-semibold transition-all cursor-pointer text-center ${
                          isSelected
                            ? `${cat.color} border-white/20 ring-1 ring-[#7c6fe0]`
                            : "bg-white/[0.02] border-white/5 text-text-secondary hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 bg-[#1a2236]/30 border-t border-white/5 flex gap-3">
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="flex-1 py-2.5 bg-[#1a2236] hover:bg-[#252f4a] border border-white/5 text-text-secondary hover:text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveModalSchedule}
                className="flex-1 py-2.5 bg-[#7c6fe0] hover:bg-[#685ad8] text-white text-xs font-semibold rounded-lg shadow-md transition-colors cursor-pointer"
              >
                Agendar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
