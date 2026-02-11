"use client";

import { useState } from "react";
import {
    CheckCircle2,
    Circle,
    Plus,
    Trash2,
    Edit,
    Calendar,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/src/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/src/components/ui/select";
import { toast } from "sonner";
import useSWR from "swr";
import { fetcher } from "@/src/lib/fetcher";
import { getAuthHeader } from "@/src/lib/auth-client";

const MONTHS = [
    "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
    "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
];

type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

interface PersonalTask {
    id: string;
    title: string;
    description: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate: string | null;
    completedAt: string | null;
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
    LOW: "Basse",
    MEDIUM: "Moyenne",
    HIGH: "Haute",
    URGENT: "Urgente",
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
    LOW: "bg-slate-500/20 text-slate-600 dark:text-slate-400",
    MEDIUM: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
    HIGH: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
    URGENT: "bg-red-500/20 text-red-600 dark:text-red-400",
};

export function TaskManagement() {
    const [taskDialogOpen, setTaskDialogOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [editingTask, setEditingTask] = useState<PersonalTask | null>(null);
    const [taskForm, setTaskForm] = useState({
        title: "",
        description: "",
        priority: "MEDIUM" as TaskPriority,
        dueDate: "",
    });

    const { data, mutate, isLoading } = useSWR<{ tasks: PersonalTask[] }>(
        "/api/personal-tasks",
        fetcher
    );

    const tasks = data?.tasks || [];
    const filteredTasks = statusFilter === "ALL"
        ? tasks
        : tasks.filter((t) => t.status === statusFilter);

    const openCreate = () => {
        setEditingTask(null);
        setTaskForm({ title: "", description: "", priority: "MEDIUM", dueDate: "" });
        setTaskDialogOpen(true);
    };

    const openEdit = (task: PersonalTask) => {
        setEditingTask(task);
        setTaskForm({
            title: task.title,
            description: task.description || "",
            priority: task.priority,
            dueDate: task.dueDate ? task.dueDate.slice(0, 16) : "",
        });
        setTaskDialogOpen(true);
    };

    const handleSubmit = async () => {
        if (!taskForm.title.trim()) {
            toast.error("Le titre est requis");
            return;
        }

        try {
            if (editingTask) {
                const res = await fetch(`/api/personal-tasks/${editingTask.id}`, {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        ...getAuthHeader(),
                    },
                    body: JSON.stringify({
                        title: taskForm.title,
                        description: taskForm.description || null,
                        priority: taskForm.priority,
                        dueDate: taskForm.dueDate || null,
                    }),
                });
                if (res.ok) {
                    toast.success("Tâche mise à jour");
                    mutate();
                    setTaskDialogOpen(false);
                } else {
                    const err = await res.json();
                    toast.error(err.error || "Erreur");
                }
            } else {
                const res = await fetch("/api/personal-tasks", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...getAuthHeader(),
                    },
                    body: JSON.stringify({
                        title: taskForm.title,
                        description: taskForm.description || null,
                        priority: taskForm.priority,
                        dueDate: taskForm.dueDate || null,
                    }),
                });
                if (res.ok) {
                    toast.success("Tâche créée");
                    mutate();
                    setTaskDialogOpen(false);
                } else {
                    const err = await res.json();
                    toast.error(err.error || "Erreur");
                }
            }
        } catch {
            toast.error("Erreur réseau");
        }
    };

    const toggleStatus = async (task: PersonalTask) => {
        const newStatus: TaskStatus = task.status === "DONE" ? "TODO" : "DONE";
        try {
            const res = await fetch(`/api/personal-tasks/${task.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeader(),
                },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) {
                toast.success(newStatus === "DONE" ? "Tâche terminée" : "Tâche réouverte");
                mutate();
            }
        } catch {
            toast.error("Erreur réseau");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Supprimer cette tâche ?")) return;
        try {
            const res = await fetch(`/api/personal-tasks/${id}`, {
                method: "DELETE",
                headers: getAuthHeader(),
            });
            if (res.ok) {
                toast.success("Tâche supprimée");
                mutate();
            }
        } catch {
            toast.error("Erreur réseau");
        }
    };

    return (
        <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm uppercase text-muted-foreground font-bold flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                </CardTitle>
                <div className="flex items-center gap-2">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-32 h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Toutes</SelectItem>
                            <SelectItem value="TODO">À faire</SelectItem>
                            <SelectItem value="IN_PROGRESS">En cours</SelectItem>
                            <SelectItem value="DONE">Terminées</SelectItem>
                            <SelectItem value="CANCELLED">Annulées</SelectItem>
                        </SelectContent>
                    </Select>
                    <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" onClick={openCreate}>
                                <Plus className="h-4 w-4 mr-1" /> Nouvelle
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-card border-border">
                            <DialogHeader>
                                <DialogTitle>{editingTask ? "Modifier la tâche" : "Nouvelle tâche"}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 pt-4">
                                <div>
                                    <Label>Titre *</Label>
                                    <Input
                                        value={taskForm.title}
                                        onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                                        placeholder="Ex: Payer les factures"
                                    />
                                </div>
                                <div>
                                    <Label>Description</Label>
                                    <Textarea
                                        value={taskForm.description}
                                        onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                                        placeholder="Détails..."
                                        rows={3}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>Priorité</Label>
                                        <Select
                                            value={taskForm.priority}
                                            onValueChange={(v) => setTaskForm({ ...taskForm, priority: v as TaskPriority })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                                                    <SelectItem key={k} value={k}>{v}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label>Échéance</Label>
                                        <Input
                                            type="datetime-local"
                                            value={taskForm.dueDate}
                                            onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <Button onClick={handleSubmit} className="w-full">
                                    {editingTask ? "Mettre à jour" : "Créer"}
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="text-sm text-muted-foreground py-6 text-center">Chargement...</div>
                ) : filteredTasks.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                        <Circle className="h-10 w-10 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Aucune tâche</p>
                        <Button variant="outline" size="sm" className="mt-2" onClick={openCreate}>
                            Créer une tâche
                        </Button>
                    </div>
                ) : (
                    <ul className="space-y-2 max-h-80 overflow-y-auto">
                        {filteredTasks.map((task) => (
                            <li
                                key={task.id}
                                className={`flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors ${task.status === "DONE" ? "opacity-70" : ""
                                    }`}
                            >
                                <button
                                    onClick={() => toggleStatus(task)}
                                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary"
                                >
                                    {task.status === "DONE" ? (
                                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                                    ) : (
                                        <Circle className="h-5 w-5" />
                                    )}
                                </button>
                                <div className="flex-1 min-w-0">
                                    <p className={`font-medium text-sm ${task.status === "DONE" ? "line-through text-muted-foreground" : ""}`}>
                                        {task.title}
                                    </p>
                                    {task.description && (
                                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                            {task.description}
                                        </p>
                                    )}
                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[task.priority]}`}>
                                            {PRIORITY_LABELS[task.priority]}
                                        </span>
                                        {task.dueDate && (
                                            <span className="text-xs text-muted-foreground flex items-center">
                                                <Calendar className="h-3 w-3 mr-0.5" />
                                                {new Date(task.dueDate).toLocaleDateString("fr-FR", {
                                                    day: "numeric",
                                                    month: "short",
                                                    year: "numeric",
                                                })}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(task)}>
                                        <Edit className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(task.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
