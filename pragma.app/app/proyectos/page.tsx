"use client";

import { useEffect, useState } from "react";
import { ProjectItem, ProjectTask, DayData } from "../../lib/supabase";
import { useAppLayout } from "../../components/AppLayout";
import { Plus, Kanban, Trash2, CheckCircle2, Circle, Edit2, Check, X } from "lucide-react";

const COLOR_PRESETS = [
  { name: "purple", value: "#7c6fe0" },
  { name: "teal", value: "#2dd4a0" },
  { name: "amber", value: "#f59e0b" },
  { name: "coral", value: "#f43f5e" },
  { name: "blue", value: "#3b82f6" },
  { name: "green", value: "#10b981" },
];

export default function ProyectosPage() {
  const { dayData, updateDayData, triggerToast } = useAppLayout();

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  // New Project Form State
  const [newProjName, setNewProjName] = useState("");
  const [newProjColor, setNewProjColor] = useState(COLOR_PRESETS[0].value);

  // Task Input State per project: { [projectId]: "task title" }
  const [taskInputs, setTaskInputs] = useState<Record<string, string>>({});

  // Inline editing project name state: { projectId: "editing name" }
  const [editingProjId, setEditingProjId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");

  // Sync projects from Supabase on load/update
  useEffect(() => {
    if (dayData) {
      setProjects(dayData.projects || []);
    }
  }, [dayData]);

  const syncProjectsToSupabase = async (updatedProjects: ProjectItem[]) => {
    const dayDataPayload: DayData = {
      ...dayData,
      projects: updatedProjects,
    };
    const success = await updateDayData(dayDataPayload);
    if (!success) {
      triggerToast("Error al guardar cambios en el servidor.");
    }
  };

  // Create Project
  const handleCreateProject = async () => {
    if (!newProjName.trim()) return;

    const newProject: ProjectItem = {
      id: `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: newProjName.trim(),
      color: newProjColor,
      tasks: [],
      created_at: new Date().toISOString().split("T")[0],
    };

    const updated = [...projects, newProject];
    setProjects(updated);
    setNewProjName("");
    setNewProjColor(COLOR_PRESETS[0].value);
    setModalOpen(false);
    triggerToast(`Proyecto "${newProject.name}" creado.`);
    await syncProjectsToSupabase(updated);
  };

  // Delete Project
  const handleDeleteProject = async (id: string, name: string) => {
    const updated = projects.filter((p) => p.id !== id);
    setProjects(updated);
    triggerToast(`Proyecto "${name}" eliminado.`);
    await syncProjectsToSupabase(updated);
  };

  // Edit Project Name (Start)
  const startEditProject = (id: string, name: string) => {
    setEditingProjId(id);
    setEditingNameValue(name);
  };

  // Save Project Name
  const saveProjectName = async (id: string) => {
    if (!editingNameValue.trim()) return;

    const updated = projects.map((p) => {
      if (p.id === id) {
        return { ...p, name: editingNameValue.trim() };
      }
      return p;
    });

    setProjects(updated);
    setEditingProjId(null);
    await syncProjectsToSupabase(updated);
  };

  // Add Task to Project
  const handleAddTask = async (projId: string) => {
    const title = taskInputs[projId] || "";
    if (!title.trim()) return;

    const newTask: ProjectTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: title.trim(),
      status: "todo",
    };

    const updated = projects.map((p) => {
      if (p.id === projId) {
        return {
          ...p,
          tasks: [...p.tasks, newTask],
        };
      }
      return p;
    });

    setProjects(updated);
    setTaskInputs({ ...taskInputs, [projId]: "" });
    await syncProjectsToSupabase(updated);
  };

  // Toggle Task Status
  const handleToggleTask = async (projId: string, taskId: string) => {
    const updated = projects.map((p) => {
      if (p.id === projId) {
        return {
          ...p,
          tasks: p.tasks.map((t) => {
            if (t.id === taskId) {
              return {
                ...t,
                status: t.status === "done" ? ("todo" as const) : ("done" as const),
              };
            }
            return t;
          }),
        };
      }
      return p;
    });

    setProjects(updated);
    await syncProjectsToSupabase(updated);
  };

  // Delete Task
  const handleDeleteTask = async (projId: string, taskId: string) => {
    const updated = projects.map((p) => {
      if (p.id === projId) {
        return {
          ...p,
          tasks: p.tasks.filter((t) => t.id !== taskId),
        };
      }
      return p;
    });

    setProjects(updated);
    await syncProjectsToSupabase(updated);
  };

  return (
    <div className="flex-1 p-4 md:p-8 space-y-6 pb-24 md:pb-8">
      {/* Header Area */}
      <div className="flex justify-between items-center select-none">
        <div className="flex items-center gap-2.5">
          <Kanban className="h-5 w-5 text-[#7c6fe0]" />
          <h1 className="text-xl font-bold text-white tracking-tight">Proyectos</h1>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#7c6fe0] hover:bg-[#685ad8] text-white text-xs font-semibold rounded-lg shadow-md transition-colors cursor-pointer select-none"
        >
          <Plus className="h-4 w-4" />
          <span>Nuevo proyecto</span>
        </button>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="bg-[#111827] border border-white/5 rounded-xl p-10 shadow-xl flex flex-col items-center justify-center text-center space-y-4 max-w-lg mx-auto mt-12 select-none">
          <div className="h-12 w-12 rounded-full bg-[#1a2236] flex items-center justify-center border border-white/5">
            <Kanban className="h-6 w-6 text-text-hint" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-white">Sin proyectos aún</h3>
            <p className="text-xs text-text-secondary max-w-[280px] leading-relaxed">
              Crea proyectos para estructurar tus tareas a largo plazo.
            </p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 bg-[#7c6fe0]/10 hover:bg-[#7c6fe0]/15 border border-[#7c6fe0]/20 text-[#7c6fe0] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Crear tu primer proyecto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((proj) => {
            const completed = proj.tasks.filter((t) => t.status === "done").length;
            const total = proj.tasks.length;
            const progress = total > 0 ? (completed / total) * 100 : 0;

            return (
              <div
                key={proj.id}
                className="bg-[#111827] border border-white/5 hover:border-white/10 rounded-xl p-5 shadow-xl flex flex-col gap-4 select-none relative transition-all duration-200"
              >
                {/* Project Header Info */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span
                      className="h-3.5 w-3.5 rounded-full shrink-0 border border-white/10"
                      style={{ backgroundColor: proj.color }}
                    />
                    {editingProjId === proj.id ? (
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <input
                          type="text"
                          value={editingNameValue}
                          onChange={(e) => setEditingNameValue(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveProjectName(proj.id)}
                          className="flex-1 bg-[#0a0e1a] border border-white/10 focus:border-[#7c6fe0]/40 rounded px-2 py-0.5 text-sm text-text-primary focus:outline-hidden"
                          autoFocus
                        />
                        <button
                          onClick={() => saveProjectName(proj.id)}
                          className="p-1 hover:text-green-400 cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingProjId(null)}
                          className="p-1 hover:text-red-400 cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <h3
                        onClick={() => startEditProject(proj.id, proj.name)}
                        className="text-sm font-semibold text-white truncate cursor-pointer hover:underline flex items-center gap-1.5 group"
                      >
                        <span>{proj.name}</span>
                        <Edit2 className="h-3 w-3 text-text-hint opacity-0 group-hover:opacity-100 transition-opacity" />
                      </h3>
                    )}
                  </div>

                  <button
                    onClick={() => handleDeleteProject(proj.id, proj.name)}
                    title="Eliminar proyecto"
                    className="text-text-hint hover:text-red-400 p-1 rounded hover:bg-white/5 transition-colors cursor-pointer shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] text-text-secondary font-mono">
                    <span>Progreso</span>
                    <span>
                      {completed}/{total} ({Math.round(progress)}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[#0a0e1a] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300 ease-out"
                      style={{ backgroundColor: proj.color, width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Task Checklist Area */}
                <div className="flex-1 overflow-y-auto max-h-[180px] space-y-2.5 pr-1 py-1">
                  {proj.tasks.length === 0 ? (
                    <div className="text-center py-6 text-text-hint text-xs font-mono">
                      No hay tareas
                    </div>
                  ) : (
                    proj.tasks.map((task) => {
                      const isDone = task.status === "done";
                      return (
                        <div
                          key={task.id}
                          className={`flex items-start justify-between gap-3 group/task ${
                            isDone ? "opacity-50" : ""
                          }`}
                        >
                          <div className="flex items-start gap-2.5 flex-1 min-w-0">
                            <button
                              onClick={() => handleToggleTask(proj.id, task.id)}
                              className="mt-0.5 shrink-0 text-text-secondary hover:text-[#2dd4a0] cursor-pointer"
                            >
                              {isDone ? (
                                <CheckCircle2 className="h-4 w-4 text-[#2dd4a0]" />
                              ) : (
                                <Circle className="h-4 w-4" />
                              )}
                            </button>
                            <span
                              className={`text-xs break-words text-text-primary select-text ${
                                isDone ? "line-through text-text-secondary decoration-white/10" : ""
                              }`}
                            >
                              {task.title}
                            </span>
                          </div>

                          <button
                            onClick={() => handleDeleteTask(proj.id, task.id)}
                            title="Eliminar tarea"
                            className="text-text-hint hover:text-red-400 opacity-100 sm:opacity-0 group-hover/task:opacity-100 transition-opacity p-0.5 cursor-pointer shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Inline task input bottom */}
                <div className="pt-2 border-t border-white/5 flex gap-2">
                  <input
                    type="text"
                    value={taskInputs[proj.id] || ""}
                    onChange={(e) =>
                      setTaskInputs({ ...taskInputs, [proj.id]: e.target.value })
                    }
                    placeholder="Nueva tarea..."
                    onKeyDown={(e) => e.key === "Enter" && handleAddTask(proj.id)}
                    className="flex-1 bg-[#0a0e1a] border border-white/5 hover:border-white/10 focus:border-white/15 focus:outline-hidden text-xs rounded px-2.5 py-1.5 text-text-primary placeholder-text-hint"
                  />
                  <button
                    onClick={() => handleAddTask(proj.id)}
                    className="p-1.5 bg-[#1a2236] hover:bg-[#252f4a] text-white rounded border border-white/5 hover:border-white/10 transition-colors cursor-pointer flex items-center justify-center shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* NEW PROJECT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setModalOpen(false)}
          />

          {/* Modal Container */}
          <div className="relative bg-[#111827] border border-white/5 rounded-xl max-w-sm w-full p-6 shadow-2xl flex flex-col gap-5 transform transition-all">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-sm font-semibold text-white">Nuevo Proyecto</h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-text-secondary hover:text-white cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-secondary font-medium">Nombre</label>
                <input
                  type="text"
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  placeholder="ej. Rediseño Web"
                  className="w-full bg-[#0a0e1a] border border-white/5 focus:border-[#7c6fe0]/40 rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-hidden"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs text-text-secondary font-medium">Color</label>
                <div className="flex items-center gap-3 py-1">
                  {COLOR_PRESETS.map((color) => (
                    <button
                      key={color.name}
                      onClick={() => setNewProjColor(color.value)}
                      className={`h-6 w-6 rounded-full border shrink-0 transition-transform ${
                        newProjColor === color.value
                          ? "scale-110 border-white/80 ring-2 ring-[#7c6fe0]/30"
                          : "border-white/10 hover:scale-105"
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 py-2 bg-[#1a2236] hover:bg-[#252f4a] border border-white/5 hover:border-white/10 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateProject}
                disabled={!newProjName.trim()}
                className="flex-1 py-2 bg-[#7c6fe0] hover:bg-[#685ad8] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
