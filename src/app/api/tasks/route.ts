import { NextResponse } from "next/server";
import { taskQueue } from "@/lib/task-queue";

// Get all tasks or active tasks
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") === "true";

  const tasks = activeOnly ? taskQueue.getActive() : taskQueue.getAll();

  return NextResponse.json(tasks);
}
