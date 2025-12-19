import { NextRequest } from "next/server";
import { taskQueue, Task } from "@/lib/task-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (data: Task[]) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      sendEvent(taskQueue.getAll());

      const onUpdate = () => {
        sendEvent(taskQueue.getAll());
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
