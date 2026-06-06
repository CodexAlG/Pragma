"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { pragmaDb, TimelineItem, VaultItem, DayData, HistoryItem } from "../../lib/supabase";
import { detectFlags, parseBrainDump, calculateEffort, autoTagIdea, parseAgendarLine } from "../../lib/parser";
import { useAppLayout } from "../../components/AppLayout";
import {
  Sparkles,
  CheckCircle2,
  Circle,
  HelpCircle,
  Lightbulb,
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

  // Timeline state
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [effortDist, setEffortDist] = useState({ dev: 0, meeting: 0, idea: 0 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync profile data on load
  useEffect(() => {
    if (dayData && dayData.current_day) {
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

  // Parse flags on text change
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setRawText(text);
    setFlags(detectFlags(text));
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
          type: "meeting", // Default to meeting for general agenda items
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
        raw_text: rawText,
        flags,
        context_answers: contextAnswers,
        timeline: parsedTimeline,
      },
      vault: updatedVault,
      history: updatedHistory,
    };

    const success = await updateDayData(dayDataPayload);
    if (success) {
      triggerToast(dayData?.current_day?.timeline && dayData.current_day.timeline.length > 0 ? "¡Tu día ha sido re-orquestado!" : "¡Tu día ha sido orquestado y guardado!");
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

  // Setup resolution logic flags
  const showDevQuestion = flags.includes("dev") || rawText.toLowerCase().includes("código") || rawText.toLowerCase().includes("codigo");
  const showMeetingQuestion = flags.includes("meeting") || rawText.toLowerCase().includes("reunión") || rawText.toLowerCase().includes("meeting");
  const showBugQuestion = rawText.toLowerCase().includes("bug") || rawText.toLowerCase().includes("fix");
  const showIdeaQuestion = flags.includes("idea") || rawText.toLowerCase().includes("idea");

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
    </div>
  );
}
