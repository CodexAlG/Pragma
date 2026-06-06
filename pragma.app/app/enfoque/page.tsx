"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TimelineItem, DayData } from "../../lib/supabase";
import { useAppLayout } from "../../components/AppLayout";
import { Play, Pause, RotateCcw, CheckCircle, Target } from "lucide-react";

export default function EnfoquePage() {
  const router = useRouter();
  const { dayData, updateDayData, triggerToast } = useAppLayout();

  // Tasks from today
  const [pendingTasks, setPendingTasks] = useState<TimelineItem[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");

  // Timer State
  // Mode can be: 'pomodoro' (25min), 'short' (5min), 'long' (15min)
  const [timerMode, setTimerMode] = useState<"pomodoro" | "short" | "long">("pomodoro");
  const [secondsLeft, setSecondsLeft] = useState<number>(25 * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Set pending tasks list on load/update
  useEffect(() => {
    if (dayData && dayData.current_day && dayData.current_day.timeline) {
      const pending = dayData.current_day.timeline.filter(
        (t) => t.status !== "done" && t.type !== "idea"
      );
      setPendingTasks(pending);

      // Auto-select first task if none selected
      if (pending.length > 0 && !selectedTaskId) {
        setSelectedTaskId(pending[0].id);
      }
    }
  }, [dayData]);

  // Handle timer tick
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            if (timerRef.current) clearInterval(timerRef.current);
            playBeep();
            triggerToast("¡Tiempo completado!");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  // Handle mode switches
  const handleModeChange = (mode: "pomodoro" | "short" | "long") => {
    setTimerMode(mode);
    setIsRunning(false);
    if (mode === "pomodoro") {
      setSecondsLeft(25 * 60);
    } else if (mode === "short") {
      setSecondsLeft(5 * 60);
    } else {
      setSecondsLeft(15 * 60);
    }
  };

  // Play synthetic beep sound using AudioContext
  const playBeep = () => {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      const audioCtx = new AudioCtxClass();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime); // clean alert tone
      gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.35); // 350ms beep
    } catch (e) {
      console.error("Audio beep failed to play:", e);
    }
  };

  // Reset current timer duration
  const handleReset = () => {
    setIsRunning(false);
    handleModeChange(timerMode);
  };

  // Format seconds to MM:SS
  const formatTime = (secs: number) => {
    const mm = Math.floor(secs / 60).toString().padStart(2, "0");
    const ss = (secs % 60).toString().padStart(2, "0");
    return `${mm}:${ss}`;
  };

  // Mark selected focus task completed and save immediately
  const handleCompleteTask = async () => {
    if (!selectedTaskId || !dayData?.current_day?.timeline) return;

    const updatedTimeline = dayData.current_day.timeline.map((task) => {
      if (task.id === selectedTaskId) {
        return { ...task, status: "done" as const };
      }
      return task;
    });

    const dayDataPayload: DayData = {
      ...dayData,
      current_day: {
        ...dayData.current_day,
        timeline: updatedTimeline,
      },
    };

    const success = await updateDayData(dayDataPayload);
    if (success) {
      triggerToast("¡Tarea completada con éxito!");
      // Redirect to today's dashboard
      router.push("/hoy");
    } else {
      triggerToast("Error al guardar en el servidor.");
    }
  };

  const selectedTask = pendingTasks.find((t) => t.id === selectedTaskId);

  return (
    <div className="flex-1 p-4 md:p-8 space-y-8 flex flex-col justify-center max-w-2xl mx-auto w-full pb-24 md:pb-8">

      {/* Task Selector Card */}
      <div className="bg-[#111827] border border-white/5 rounded-xl p-5 md:p-6 shadow-xl space-y-4 select-none">
        <div className="flex items-center gap-2">
          <Target className="h-4.5 w-4.5 text-[#7c6fe0]" />
          <span className="text-xs font-mono text-text-secondary uppercase tracking-wider">
            ¿En qué vas a enfocarte hoy?
          </span>
        </div>

        {pendingTasks.length === 0 ? (
          <div className="text-sm text-text-hint py-2">
            No tienes tareas pendientes para hoy. Escribe y orquesta tu día en{" "}
            <Link href="/hoy" className="text-[#7c6fe0] hover:underline">
              Hoy
            </Link>{" "}
            para añadir tareas.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <select
              value={selectedTaskId}
              onChange={(e) => setSelectedTaskId(e.target.value)}
              className="w-full bg-[#0a0e1a] border border-white/5 focus:border-[#7c6fe0]/40 rounded-lg px-3.5 py-2.5 text-sm text-text-primary focus:outline-hidden cursor-pointer"
            >
              {pendingTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.time ? `[${t.time}] ` : ""}
                  {t.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Pomodoro Timer Center Card */}
      <div className="bg-[#111827] border border-white/5 rounded-xl p-6 md:p-8 shadow-xl flex flex-col items-center justify-center space-y-6 text-center select-none">
        {/* Mode chips */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={() => handleModeChange("pomodoro")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              timerMode === "pomodoro"
                ? "bg-[#7c6fe0]/10 border border-[#7c6fe0]/30 text-white"
                : "bg-transparent border border-transparent text-text-secondary hover:text-white"
            }`}
          >
            Pomodoro 25m
          </button>
          <button
            onClick={() => handleModeChange("short")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              timerMode === "short"
                ? "bg-[#2dd4a0]/10 border border-[#2dd4a0]/30 text-white"
                : "bg-transparent border border-transparent text-text-secondary hover:text-white"
            }`}
          >
            Descanso corto 5m
          </button>
          <button
            onClick={() => handleModeChange("long")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              timerMode === "long"
                ? "bg-[#d4a06a]/10 border border-[#d4a06a]/30 text-white"
                : "bg-transparent border border-transparent text-text-secondary hover:text-white"
            }`}
          >
            Descanso largo 15m
          </button>
        </div>

        {/* Large Timer Display */}
        <div
          className="font-mono text-7xl md:text-8xl font-bold tracking-tighter text-white select-all py-2"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          {formatTime(secondsLeft)}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4">
          {isRunning ? (
            <button
              onClick={() => setIsRunning(false)}
              className="flex items-center gap-2 px-6 py-2.5 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 text-red-400 text-sm font-semibold rounded-lg transition-colors cursor-pointer select-none"
            >
              <Pause className="h-4 w-4" />
              <span>Pausar</span>
            </button>
          ) : (
            <button
              onClick={() => setIsRunning(true)}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#7c6fe0] hover:bg-[#685ad8] text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer select-none"
            >
              <Play className="h-4 w-4" />
              <span>Iniciar</span>
            </button>
          )}

          <button
            onClick={handleReset}
            title="Reiniciar cronómetro"
            className="p-2.5 bg-[#1a2236] hover:bg-[#252f4a] border border-white/5 hover:border-white/10 text-text-secondary hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Focus Task Detail & Action Button */}
      {selectedTask && (
        <div className="bg-[#1a2236] border border-white/5 rounded-xl p-5 md:p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 select-none">
          <div className="flex-1 min-w-0 space-y-1">
            <span className="text-[10px] font-mono uppercase text-[#7c6fe0] tracking-wider font-bold">
              Enfoque actual
            </span>
            <h3 className="text-sm font-semibold text-white leading-snug break-words">
              {selectedTask.title}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-sm ${
                  selectedTask.type === "dev"
                    ? "bg-[#7c6fe0]/15 text-[#7c6fe0]"
                    : selectedTask.type === "meeting"
                    ? "bg-blue-500/10 text-blue-400"
                    : selectedTask.type === "learning"
                    ? "bg-sky-500/10 text-sky-400"
                    : selectedTask.type === "idea"
                    ? "bg-[#d4a06a]/15 text-[#d4a06a]"
                    : "bg-pink-500/10 text-pink-400"
                }`}
              >
                {selectedTask.type === "dev"
                  ? "Desarrollo"
                  : selectedTask.type === "meeting"
                  ? "Reunión"
                  : selectedTask.type === "learning"
                  ? "Estudio"
                  : selectedTask.type === "idea"
                  ? "Idea"
                  : "Personal"}
              </span>
              {selectedTask.time && (
                <span className="text-[9px] font-mono text-text-secondary">
                  Hora: {selectedTask.time}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleCompleteTask}
            className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 px-5 py-3 bg-[#2dd4a0] hover:bg-[#24bf8f] text-[#0a0e1a] text-xs font-bold rounded-lg transition-colors cursor-pointer select-none"
          >
            <CheckCircle className="h-4 w-4" />
            <span>Completar tarea</span>
          </button>
        </div>
      )}
    </div>
  );
}
