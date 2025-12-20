"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  XIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  LoaderIcon,
  StopCircleIcon,
} from "lucide-react";
import type { Task } from "@/lib/task-queue";

interface TaskProgressProps {
  onTaskComplete?: () => void;
}

export function TaskProgress({ onTaskComplete }: TaskProgressProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const onTaskCompleteRef = useRef(onTaskComplete);
  const retryDelayRef = useRef(1000);

  useEffect(() => {
    onTaskCompleteRef.current = onTaskComplete;
  }, [onTaskComplete]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      eventSource = new EventSource("/api/tasks/stream");

      eventSource.onmessage = (event) => {
        try {
          const data: Task[] = JSON.parse(event.data);
          setTasks(data);
          retryDelayRef.current = 1000;

          for (const task of data) {
            if (
              task.status === "completed" &&
              !notifiedIdsRef.current.has(task.id)
            ) {
              notifiedIdsRef.current.add(task.id);
              onTaskCompleteRef.current?.();
            }
          }
        } catch (err) {
          console.error("Failed to parse tasks event:", err);
        }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        eventSource = null;
        if (closed) return;

        const delay = retryDelayRef.current;
        retryDelayRef.current = Math.min(delay * 2, 30000);
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closed = true;
      if (eventSource) {
        eventSource.close();
      }
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, []);

  const dismissTask = async (taskId: string) => {
    setDismissedIds((prev) => new Set(prev).add(taskId));
    try {
      await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    } catch {
      // Ignore errors
    }
  };

  const cancelTask = async (taskId: string) => {
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
    } catch {
      // Ignore errors
    }
  };

  const visibleTasks = tasks.filter(
    (task) =>
      !dismissedIds.has(task.id) &&
      (task.status === "running" ||
        task.status === "pending" ||
        task.status === "completed" ||
        task.status === "failed" ||
        task.status === "cancelled"),
  );

  if (visibleTasks.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {visibleTasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onDismiss={() => dismissTask(task.id)}
          onCancel={() => cancelTask(task.id)}
        />
      ))}
    </div>
  );
}

interface TaskCardProps {
  task: Task;
  onDismiss: () => void;
  onCancel: () => void;
}

function TaskCard({ task, onDismiss, onCancel }: TaskCardProps) {
  const progress =
    task.progress.total > 0
      ? (task.progress.current / task.progress.total) * 100
      : 0;

  const statusIcon = {
    pending: (
      <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
    ),
    running: <LoaderIcon className="size-4 animate-spin text-blue-500" />,
    completed: <CheckCircleIcon className="size-4 text-green-500" />,
    failed: <AlertCircleIcon className="size-4 text-red-500" />,
    cancelled: <StopCircleIcon className="size-4 text-orange-500" />,
  }[task.status];

  const { t } = useTranslation();

  const statusLabel = {
    pending: t("task.status.pending"),
    running: t("task.status.running"),
    completed: t("task.status.completed"),
    failed: t("task.status.failed"),
    cancelled: t("task.status.cancelled"),
  }[task.status];

  return (
    <div className="bg-background border rounded-lg shadow-lg p-4 animate-in slide-in-from-right-5 duration-300">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {statusIcon}
          <span className="text-sm font-medium">{t("task.opml_import")}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 -mr-1 -mt-1"
          onClick={onDismiss}
        >
          <XIcon className="size-4" />
        </Button>
      </div>

      {task.status === "running" || task.status === "pending" ? (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>{statusLabel}</span>
            <span>
              {task.progress.current} / {task.progress.total} (
              {Math.round(progress)}%)
            </span>
          </div>
          <Progress value={progress} className="h-2 mb-2" />
          {task.progress.message && (
            <div className="text-xs truncate">
              <span className="text-foreground">{task.progress.message}</span>
            </div>
          )}
          {task.progress.detail && (
            <div className="text-xs text-muted-foreground truncate">
              {task.progress.detail}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full h-7 text-xs"
            onClick={onCancel}
          >
            <StopCircleIcon className="size-3 mr-1" />
            {t("task.cancel")}
          </Button>
        </>
      ) : task.status === "completed" ? (
        <div className="text-sm">
          <span className="text-green-600">
            Imported {task.result?.imported || 0} feeds
          </span>
          {(task.result?.skipped || 0) > 0 && (
            <span className="text-muted-foreground ml-2">
              ({task.result?.skipped} skipped)
            </span>
          )}
        </div>
      ) : task.status === "cancelled" ? (
        <div className="text-sm">
          <span className="text-orange-600">
            Cancelled - Imported {task.result?.imported || 0} feeds
          </span>
          {(task.result?.skipped || 0) > 0 && (
            <span className="text-muted-foreground ml-2">
              ({task.result?.skipped} skipped)
            </span>
          )}
        </div>
      ) : (
        <div className="text-sm text-red-600">
          {task.result?.error || "Import failed"}
        </div>
      )}
    </div>
  );
}
