"use client";

import { useEffect, useState } from "react";
import { HistoryItem, DayData, TimelineItem } from "../../lib/supabase";
import { calculateEffort } from "../../lib/parser";
import { useAppLayout } from "../../components/AppLayout";
import {
  ChevronLeft,
  ChevronRight,
  History,
  X,
  Calendar,
  Lightbulb,
  CheckCircle2,
  Circle,
  Trash2,
  Plus,
} from "lucide-react";

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export default function HistorialPage() {
  const { dayData, updateDayData, triggerToast } = useAppLayout();

  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);

  // Calendar state (defaults to current month)
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"list" | "hours">("list");

  // Form state for adding new events
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteType, setNewNoteType] = useState<TimelineItem["type"]>("meeting");
  const [newNoteStart, setNewNoteStart] = useState("09:00");
  const [newNoteEnd, setNewNoteEnd] = useState("10:00");

  // Sync history list from Supabase
  useEffect(() => {
    if (dayData) {
      setHistoryList(dayData.history || []);
    }
  }, [dayData]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Get calendar details
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = new Date(year, month, 1).getDay();

  // Navigation handlers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleSelectDay = (dateStr: string) => {
    setSelectedDateStr(dateStr);
    setPanelOpen(true);
  };

  // Check if date is today
  const isToday = (dayNum: number) => {
    const today = new Date();
    return (
      today.getDate() === dayNum &&
      today.getMonth() === month &&
      today.getFullYear() === year
    );
  };

  // Sync data to history and today's active timeline if selectedDateStr is today
  const syncDayData = async (updatedTimeline: TimelineItem[]) => {
    if (!dayData) return;

    const effort_distribution = calculateEffort(updatedTimeline);

    let updatedHistory = [...(dayData.history || [])];
    updatedHistory = updatedHistory.filter((h) => h.date !== selectedDateStr);

    if (updatedTimeline.length > 0) {
      updatedHistory.push({
        date: selectedDateStr,
        timeline: updatedTimeline,
        effort_distribution,
      });
    }

    const updatedPayload: DayData = {
      ...dayData,
      history: updatedHistory,
    };

    // Double-sync: If clicked day is today, update current_day as well
    const todayStr = new Date().toISOString().split("T")[0];
    if (selectedDateStr === todayStr) {
      updatedPayload.current_day = {
        ...dayData.current_day,
        date: todayStr,
        raw_text: dayData.current_day?.raw_text || "",
        flags: dayData.current_day?.flags || [],
        context_answers: dayData.current_day?.context_answers || {},
        timeline: updatedTimeline,
      };
    }

    const success = await updateDayData(updatedPayload);
    if (success) {
      triggerToast("Cambios guardados con éxito.");
    } else {
      triggerToast("Error al guardar en el servidor.");
    }
  };

  const handleToggleEventStatus = async (eventId: string) => {
    const updatedTimeline = selectedDayLog.timeline.map((item) => {
      if (item.id === eventId) {
        return {
          ...item,
          status: item.status === "done" ? ("pending" as const) : ("done" as const),
        };
      }
      return item;
    });
    await syncDayData(updatedTimeline);
  };

  const handleDeleteEvent = async (eventId: string) => {
    const updatedTimeline = selectedDayLog.timeline.filter((item) => item.id !== eventId);
    await syncDayData(updatedTimeline);
  };

  const handleCreateEvent = async () => {
    if (!newNoteTitle.trim()) return;

    let startTime = newNoteStart || "00:00";
    let endTime = newNoteEnd || "";

    if (!endTime || endTime === startTime) {
      const [h, m] = startTime.split(":").map(Number);
      const endH = (h + 1) % 24;
      endTime = `${endH.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    }

    const formattedTimeRange = `${startTime} - ${endTime}`;

    const newEvent: TimelineItem = {
      id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      time: formattedTimeRange,
      title: newNoteTitle.trim(),
      type: newNoteType,
      status: "pending",
    };

    const updatedTimeline = [...selectedDayLog.timeline, newEvent];
    updatedTimeline.sort((a, b) => {
      const aStart = a.time.split("-")[0].trim();
      const bStart = b.time.split("-")[0].trim();
      return aStart.localeCompare(bStart);
    });

    await syncDayData(updatedTimeline);
    setNewNoteTitle("");
  };

  const handleSlotClick = (hour: number) => {
    const sh = `${hour.toString().padStart(2, "0")}:00`;
    const eh = `${((hour + 1) % 24).toString().padStart(2, "0")}:00`;
    setNewNoteStart(sh);
    setNewNoteEnd(eh);
    triggerToast(`Horario configurado: ${sh} - ${eh}`);
  };

  const eventOverlapsHour = (eventTime: string, slotHour: number): boolean => {
    if (!eventTime) return false;
    const parts = eventTime.split("-").map((p) => p.trim());
    const startPart = parts[0];
    const endPart = parts[1] || "";

    const shMatch = startPart.match(/(\d{1,2}):(\d{2})/);
    if (!shMatch) return false;
    const sh = parseInt(shMatch[1]);
    const sm = parseInt(shMatch[2]);
    const startFloat = sh + sm / 60;

    let eh = sh + 1;
    let em = sm;
    if (endPart) {
      const ehMatch = endPart.match(/(\d{1,2}):(\d{2})/);
      if (ehMatch) {
        eh = parseInt(ehMatch[1]);
        em = parseInt(ehMatch[2]);
      }
    }
    const endFloat = eh + em / 60;

    return startFloat < slotHour + 1 && endFloat > slotHour;
  };

  // Calendar cells generation
  const cells: React.ReactNode[] = [];

  // Empty cells for padding
  for (let i = 0; i < startDay; i++) {
    cells.push(<div key={`empty-${i}`} className="h-16 border border-white/5 opacity-20" />);
  }

  // Actual day cells
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${(month + 1).toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
    const matchingLog = historyList.find((h) => h.date === dateStr);

    const todayOutline = isToday(day)
      ? "border-2 border-[#7c6fe0] shadow-[0_0_10px_rgba(124,111,224,0.15)]"
      : "border border-white/5";

    const hoverStyle = "hover:border-[#7c6fe0]/40 hover:bg-[#1a2236]/30 cursor-pointer";

    cells.push(
      <div
        key={`day-${day}`}
        onClick={() => handleSelectDay(dateStr)}
        className={`h-16 flex flex-col items-center justify-between p-2 rounded-lg bg-[#111827] select-none transition-all duration-150 ${todayOutline} ${hoverStyle}`}
      >
        <span
          className={`text-xs font-semibold ${
            isToday(day) ? "text-[#7c6fe0] font-bold" : "text-text-primary"
          }`}
        >
          {day}
        </span>

        {/* Highlight Dot if entry exists and timeline is not empty */}
        {matchingLog && matchingLog.timeline.length > 0 ? (
          <div className="flex flex-col items-center">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7c6fe0] animate-pulse" />
            <span className="text-[8px] text-text-hint font-mono mt-0.5 uppercase tracking-widest scale-85">
              {matchingLog.timeline.length} items
            </span>
          </div>
        ) : (
          <div className="h-2" />
        )}
      </div>
    );
  }

  // Derive selected day log reactively
  const selectedDayLog: HistoryItem = historyList.find((h) => h.date === selectedDateStr) || {
    date: selectedDateStr,
    timeline: [],
    effort_distribution: { dev: 0, meeting: 0, idea: 0 },
  };

  // Calculate effort for selected log
  const efforts = calculateEffort(selectedDayLog.timeline);

  return (
    <div className="flex-1 p-4 md:p-8 space-y-6 pb-24 md:pb-8 flex flex-col h-full min-h-0">
      {/* Page Header */}
      <div className="flex items-center gap-2.5 select-none shrink-0">
        <History className="h-5 w-5 text-[#7c6fe0]" />
        <h1 className="text-xl font-bold text-white tracking-tight">Historial</h1>
      </div>

      {/* Calendar container */}
      <div className="bg-[#111827] border border-white/5 rounded-xl p-5 md:p-6 shadow-xl flex flex-col gap-5 flex-1 min-h-0 select-none">
        {/* Month Header Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-white">
              {MONTHS[month]} {year}
            </h2>
            <span className="text-[10px] text-text-secondary font-mono mt-0.5 uppercase tracking-wider">
              {historyList.filter((h) => h.timeline.length > 0).length} Días registrados
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevMonth}
              className="p-2 bg-[#1a2236] hover:bg-[#252f4a] border border-white/5 hover:border-white/10 rounded-lg text-text-secondary hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={handleNextMonth}
              className="p-2 bg-[#1a2236] hover:bg-[#252f4a] border border-white/5 hover:border-white/10 rounded-lg text-text-secondary hover:text-white transition-colors cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Days grid headers */}
        <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-mono text-text-secondary uppercase tracking-widest py-1 border-b border-white/5">
          {WEEKDAYS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        {/* Calendar Cells Grid */}
        <div className="grid grid-cols-7 gap-2 overflow-y-auto flex-1 pr-1">
          {cells}
        </div>
      </div>

      {/* DRAWER — HISTORIAL LOG DETAIL (Slide-over from right) */}
      <div
        className={`fixed inset-0 z-50 overflow-hidden select-none ${
          panelOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        {/* Backdrop overlay */}
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300 ${
            panelOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setPanelOpen(false)}
        />

        <div className="absolute inset-y-0 right-0 pl-10 max-w-full flex">
          <div
            className={`w-screen max-w-md bg-[#111827] border-l border-white/5 shadow-2xl flex flex-col h-full transform transition-transform duration-300 ease-in-out ${
              panelOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            {/* Header */}
            <div className="h-16 px-6 border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <Calendar className="h-4.5 w-4.5 text-[#7c6fe0]" />
                <span className="text-sm font-semibold text-white">
                  Registro: {selectedDateStr}
                </span>
              </div>
              <button
                onClick={() => setPanelOpen(false)}
                className="text-text-secondary hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* View Tab Selector */}
            <div className="flex border-b border-white/5 bg-[#1a2236]/30 px-6 py-2.5 shrink-0 select-none">
              <button
                onClick={() => setActiveTab("list")}
                className={`flex-1 py-1.5 text-center text-xs font-semibold rounded-lg transition-all duration-150 cursor-pointer ${
                  activeTab === "list"
                    ? "bg-[#7c6fe0] text-white shadow-md"
                    : "text-text-secondary hover:text-white"
                }`}
              >
                Lista
              </button>
              <button
                onClick={() => setActiveTab("hours")}
                className={`flex-1 py-1.5 text-center text-xs font-semibold rounded-lg transition-all duration-150 cursor-pointer ${
                  activeTab === "hours"
                    ? "bg-[#7c6fe0] text-white shadow-md"
                    : "text-text-secondary hover:text-white"
                }`}
              >
                Horas
              </button>
            </div>

            {/* Content list */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Effort donut chart - only show if there are events */}
              {selectedDayLog.timeline.length > 0 && (
                <div className="bg-[#1a2236]/30 border border-white/5 rounded-xl p-4 flex flex-col items-center space-y-4 shrink-0">
                  <div className="text-[10px] font-mono text-text-secondary uppercase tracking-wider w-full text-left">
                    Esfuerzo del día
                  </div>

                  <div className="flex items-center gap-6 w-full">
                    {/* SVG Donut */}
                    <div className="relative h-24 w-24 flex items-center justify-center shrink-0">
                      <svg className="h-full w-full transform -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="40" fill="transparent" stroke="#0a0e1a" strokeWidth="10" />
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="transparent"
                          stroke="#7c6fe0"
                          strokeWidth="10"
                          strokeDasharray={`${efforts.dev} ${100 - efforts.dev}`}
                          strokeDashoffset="0"
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="transparent"
                          stroke="#2dd4a0"
                          strokeWidth="10"
                          strokeDasharray={`${efforts.meeting} ${100 - efforts.meeting}`}
                          strokeDashoffset={-efforts.dev}
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="transparent"
                          stroke="#d4a06a"
                          strokeWidth="10"
                          strokeDasharray={`${efforts.idea} ${100 - efforts.idea}`}
                          strokeDashoffset={-(efforts.dev + efforts.meeting)}
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center">
                        <span className="text-base font-bold text-white font-mono leading-none">
                          {selectedDayLog.timeline.length}
                        </span>
                      </div>
                    </div>

                    {/* Legend stats */}
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-sans">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-[#7c6fe0]" />
                          <span className="text-text-secondary">Desarrollo</span>
                        </div>
                        <span className="font-mono text-white font-bold">{efforts.dev}%</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-sans">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-[#2dd4a0]" />
                          <span className="text-text-secondary">Gestión</span>
                        </div>
                        <span className="font-mono text-white font-bold">{efforts.meeting}%</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-sans">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-[#d4a06a]" />
                          <span className="text-text-secondary">Ideas</span>
                        </div>
                        <span className="font-mono text-white font-bold">{efforts.idea}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab views */}
              {activeTab === "list" ? (
                <div className="space-y-3.5">
                  <div className="text-[10px] font-mono text-text-secondary uppercase tracking-wider">
                    Línea de tiempo
                  </div>

                  {selectedDayLog.timeline.length === 0 ? (
                    <div className="text-center py-12 text-text-hint text-xs border border-dashed border-white/5 rounded-xl">
                      Sin notas para este día. Usa el formulario de abajo para agregar una.
                    </div>
                  ) : (
                    <div className="relative pl-5 space-y-4">
                      <div className="absolute left-[9px] top-2 bottom-2 w-px bg-white/5" />

                      {selectedDayLog.timeline.map((item, index) => {
                        const isCompleted = item.status === "done";
                        const isIdea = item.type === "idea";

                        return (
                          <div
                            key={item.id || index}
                            className={`group relative flex items-start gap-3 p-3 rounded-lg border transition-all ${
                              isCompleted
                                ? "bg-white/[0.01] border-white/5 opacity-50"
                                : isIdea
                                ? "bg-[#d4a06a]/[0.02] border-[#d4a06a]/10"
                                : "bg-[#1a2236]/30 border-white/5 hover:border-white/12"
                            }`}
                          >
                            <button
                              onClick={() => handleToggleEventStatus(item.id)}
                              className="mt-0.5 shrink-0 text-text-secondary hover:text-[#2dd4a0] cursor-pointer transition-colors duration-150"
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="h-4.5 w-4.5 text-[#2dd4a0] fill-[#2dd4a0]/10" />
                              ) : (
                                <Circle className="h-4.5 w-4.5" />
                              )}
                            </button>

                            <div className="flex-1 min-w-0 flex flex-col gap-0.5 pr-6">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                {item.time && (
                                  <span className={`font-mono text-[11px] ${
                                    isCompleted ? "text-text-hint" : isIdea ? "text-[#d4a06a]" : "text-[#7c6fe0]"
                                  }`}>
                                    {item.time}
                                  </span>
                                )}
                                <h4
                                  className={`text-xs font-semibold break-words ${
                                    isCompleted ? "text-text-secondary line-through" : "text-white"
                                  }`}
                                >
                                  {item.title}
                                </h4>
                              </div>

                              <span className={`text-[9px] font-mono uppercase w-max mt-1 px-1.5 py-0.5 rounded-sm ${
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
                                {item.type}
                              </span>
                            </div>

                            {/* Delete button */}
                            <button
                              onClick={() => handleDeleteEvent(item.id)}
                              title="Eliminar nota"
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
              ) : (
                <div className="space-y-3.5">
                  <div className="text-[10px] font-mono text-text-secondary uppercase tracking-wider">
                    Horas del día
                  </div>

                  <div className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden bg-[#111827]">
                    {Array.from({ length: 24 }).map((_, h) => {
                      const slotLabel = `${h.toString().padStart(2, "0")}:00`;
                      const overlappingEvents = selectedDayLog.timeline.filter((item) =>
                        eventOverlapsHour(item.time, h)
                      );

                      return (
                        <div key={h} className="flex min-h-[56px] transition-colors hover:bg-white/[0.01] group">
                          {/* Hour Column */}
                          <div className="w-18 shrink-0 flex items-center justify-center border-r border-white/5 font-mono text-[10px] text-text-secondary select-none">
                            {slotLabel}
                          </div>

                          {/* Event slot area */}
                          <div
                            onClick={() => handleSlotClick(h)}
                            className="flex-1 p-2 flex flex-col gap-1.5 justify-center min-h-[44px] cursor-pointer"
                          >
                            {overlappingEvents.length === 0 ? (
                              <span className="text-[10px] text-text-hint/30 font-mono italic select-none pl-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                + Agendar a las {slotLabel}
                              </span>
                            ) : (
                              overlappingEvents.map((item, index) => {
                                const isCompleted = item.status === "done";
                                return (
                                  <div
                                    key={item.id || index}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border text-[11px] font-sans ${
                                      isCompleted
                                        ? "bg-white/[0.01] border-white/5 opacity-50 text-text-secondary"
                                        : item.type === "idea"
                                        ? "bg-[#d4a06a]/5 border-[#d4a06a]/20 text-white"
                                        : "bg-[#1a2236] border-white/5 text-white"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                        item.type === "dev"
                                          ? "bg-[#7c6fe0]"
                                          : item.type === "bug"
                                          ? "bg-red-400"
                                          : item.type === "meeting"
                                          ? "bg-blue-400"
                                          : item.type === "client"
                                          ? "bg-[#2dd4a0]"
                                          : "bg-[#d4a06a]"
                                      }`} />
                                      <span className="font-mono text-[9px] text-text-secondary shrink-0">
                                        {item.time.split(" - ")[0]}
                                      </span>
                                      <span className={`font-medium truncate ${isCompleted ? "line-through" : ""}`}>
                                        {item.title}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        onClick={() => handleToggleEventStatus(item.id)}
                                        className="text-text-secondary hover:text-[#2dd4a0] cursor-pointer p-0.5"
                                      >
                                        {isCompleted ? (
                                          <CheckCircle2 className="h-3 w-3 text-[#2dd4a0] fill-[#2dd4a0]/10" />
                                        ) : (
                                          <Circle className="h-3 w-3" />
                                        )}
                                      </button>
                                      <button
                                        onClick={() => handleDeleteEvent(item.id)}
                                        className="text-text-secondary hover:text-red-400 cursor-pointer p-0.5"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Add Note Footer Form */}
            <div className="p-5 border-t border-white/5 bg-[#111827] shrink-0 select-none">
              <div className="flex flex-col gap-3">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5 text-[#7c6fe0]" />
                  <span>Agregar nota / evento</span>
                </div>

                <input
                  type="text"
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                  placeholder="ej. Cumpleaños abuela..."
                  onKeyDown={(e) => e.key === "Enter" && handleCreateEvent()}
                  className="w-full bg-[#0a0e1a] border border-white/5 hover:border-white/10 focus:border-[#7c6fe0]/40 text-text-primary text-xs rounded-lg px-3 py-2.5 focus:outline-hidden transition-all placeholder-text-hint"
                />

                <div className="grid grid-cols-3 gap-2">
                  {/* Start Hour */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-text-secondary font-medium uppercase font-mono">Inicio</label>
                    <input
                      type="time"
                      value={newNoteStart}
                      onChange={(e) => setNewNoteStart(e.target.value)}
                      className="w-full bg-[#0a0e1a] border border-white/5 focus:border-[#7c6fe0]/40 text-text-primary text-xs rounded-lg px-2 py-2 focus:outline-hidden text-center"
                    />
                  </div>

                  {/* End Hour */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-text-secondary font-medium uppercase font-mono">Fin</label>
                    <input
                      type="time"
                      value={newNoteEnd}
                      onChange={(e) => setNewNoteEnd(e.target.value)}
                      className="w-full bg-[#0a0e1a] border border-white/5 focus:border-[#7c6fe0]/40 text-text-primary text-xs rounded-lg px-2 py-2 focus:outline-hidden text-center"
                    />
                  </div>

                  {/* Type select */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-text-secondary font-medium uppercase font-mono">Categoría</label>
                    <select
                      value={newNoteType}
                      onChange={(e) => setNewNoteType(e.target.value as any)}
                      className="w-full bg-[#0a0e1a] border border-white/5 focus:border-[#7c6fe0]/40 text-text-primary text-xs rounded-lg px-2 py-2 focus:outline-hidden"
                    >
                      <option value="meeting">Reunión</option>
                      <option value="dev">Desarrollo</option>
                      <option value="bug">Bug</option>
                      <option value="client">Cliente</option>
                      <option value="idea">Idea</option>
                      <option value="Personal">Personal</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleCreateEvent}
                  className="w-full py-2.5 bg-[#7c6fe0] hover:bg-[#685ad8] text-white text-xs font-semibold rounded-lg shadow-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Agregar evento</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

