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
  const { dayData } = useAppLayout();

  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);

  // Calendar state (defaults to current month)
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDayLog, setSelectedDayLog] = useState<HistoryItem | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

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

  const handleSelectDay = (log: HistoryItem) => {
    setSelectedDayLog(log);
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

    const hoverStyle = matchingLog
      ? "hover:border-[#7c6fe0]/40 hover:bg-[#1a2236]/30 cursor-pointer"
      : "";

    cells.push(
      <div
        key={`day-${day}`}
        onClick={() => matchingLog && handleSelectDay(matchingLog)}
        className={`h-16 flex flex-col items-center justify-between p-2 rounded-lg bg-[#111827] select-none transition-all duration-150 ${todayOutline} ${hoverStyle}`}
      >
        <span
          className={`text-xs font-semibold ${
            isToday(day) ? "text-[#7c6fe0] font-bold" : "text-text-primary"
          }`}
        >
          {day}
        </span>

        {/* Highlight Dot if entry exists */}
        {matchingLog ? (
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

  // Calculate effort for selected log
  const efforts = selectedDayLog ? calculateEffort(selectedDayLog.timeline) : { dev: 0, meeting: 0, idea: 0 };

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
              {historyList.length} Días registrados
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
            <div className="h-16 px-6 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Calendar className="h-4.5 w-4.5 text-[#7c6fe0]" />
                <span className="text-sm font-semibold text-white">
                  Registro: {selectedDayLog?.date}
                </span>
              </div>
              <button
                onClick={() => setPanelOpen(false)}
                className="text-text-secondary hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content list */}
            {selectedDayLog && (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Effort donut chart */}
                <div className="bg-[#1a2236]/30 border border-white/5 rounded-xl p-4 flex flex-col items-center space-y-4">
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

                {/* Read-Only Timeline */}
                <div className="space-y-3.5">
                  <div className="text-[10px] font-mono text-text-secondary uppercase tracking-wider">
                    Línea de tiempo
                  </div>

                  <div className="relative pl-5 space-y-4">
                    <div className="absolute left-[9px] top-2 bottom-2 w-px bg-white/5" />

                    {selectedDayLog.timeline.map((item, index) => {
                      const isCompleted = item.status === "done";
                      const isIdea = item.type === "idea";

                      return (
                        <div
                          key={item.id || index}
                          className={`relative flex items-start gap-3 p-2.5 rounded-lg border ${
                            isCompleted
                              ? "bg-white/[0.01] border-white/5 opacity-50"
                              : isIdea
                              ? "bg-[#d4a06a]/[0.02] border-[#d4a06a]/10"
                              : "bg-[#1a2236]/30 border-white/5"
                          }`}
                        >
                          <div className="mt-0.5 shrink-0 z-10">
                            {isIdea ? (
                              <Lightbulb className="h-4 w-4 text-[#d4a06a]" />
                            ) : isCompleted ? (
                              <CheckCircle2 className="h-4 w-4 text-[#2dd4a0]" />
                            ) : (
                              <Circle className="h-4 w-4 text-text-secondary" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
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
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
