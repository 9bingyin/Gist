import { EventEmitter } from "events";

export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface TaskProgress {
  current: number;
  total: number;
  message?: string;
  detail?: string;
}

export interface Task {
  id: string;
  type: string;
  status: TaskStatus;
  progress: TaskProgress;
  result?: {
    imported?: number;
    skipped?: number;
    failed?: number;
    error?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

class TaskQueue extends EventEmitter {
  private tasks: Map<string, Task> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.setMaxListeners(100);
    if (typeof setInterval !== "undefined") {
      this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }
  }

  generateId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  create(type: string, total: number): Task {
    const id = this.generateId();
    const task: Task = {
      id,
      type,
      status: "pending",
      progress: {
        current: 0,
        total,
        message: "Waiting to start...",
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.tasks.set(id, task);
    this.emit("task:update", task);
    return task;
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  getAll(): Task[] {
    return Array.from(this.tasks.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  getActive(): Task[] {
    return this.getAll().filter(
      (t) => t.status === "pending" || t.status === "running",
    );
  }

  update(
    id: string,
    updates: Partial<Pick<Task, "status" | "progress" | "result">>,
  ): Task | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    if (updates.status) task.status = updates.status;
    if (updates.progress)
      task.progress = { ...task.progress, ...updates.progress };
    if (updates.result) task.result = updates.result;
    task.updatedAt = new Date();

    this.emit("task:update", task);
    return task;
  }

  delete(id: string): boolean {
    return this.tasks.delete(id);
  }

  cancel(id: string): Task | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    if (task.status === "pending" || task.status === "running") {
      task.status = "cancelled";
      task.progress.message = "Cancelled by user";
      task.updatedAt = new Date();
      this.emit("task:update", task);
    }
    return task;
  }

  isCancelled(id: string): boolean {
    const task = this.tasks.get(id);
    return task?.status === "cancelled";
  }

  cleanup(): void {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000;

    for (const [id, task] of this.tasks) {
      if (
        (task.status === "completed" ||
          task.status === "failed" ||
          task.status === "cancelled") &&
        now - task.updatedAt.getTime() > maxAge
      ) {
        this.tasks.delete(id);
      }
    }
  }
}

const globalForTasks = globalThis as unknown as {
  taskQueue: TaskQueue | undefined;
};

export const taskQueue = globalForTasks.taskQueue ?? new TaskQueue();

if (process.env.NODE_ENV !== "production") {
  globalForTasks.taskQueue = taskQueue;
}
