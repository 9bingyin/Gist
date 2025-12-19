import { NextRequest } from "next/server";
import { taskQueue, Task } from "@/lib/task-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const task = taskQueue.get(id);

  if (!task) {
    return new Response("Task not found", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (data: Task) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      sendEvent(task);

      if (
        task.status === "completed" ||
        task.status === "failed" ||
        task.status === "cancelled"
      ) {
        controller.close();
        return;
      }

      const onUpdate = (updatedTask: Task) => {
        if (updatedTask.id !== id) return;

        sendEvent(updatedTask);

        if (
          updatedTask.status === "completed" ||
          updatedTask.status === "failed" ||
          updatedTask.status === "cancelled"
        ) {
          taskQueue.off("task:update", onUpdate);
          controller.close();
        }
      };

      taskQueue.on("task:update", onUpdate);

      request.signal.addEventListener("abort", () => {
        taskQueue.off("task:update", onUpdate);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
