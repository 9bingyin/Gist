import { NextResponse } from "next/server";
import { restartAutoRefresh } from "@/lib/auto-refresh";

// Restart auto refresh (called when settings change)
export async function POST() {
  await restartAutoRefresh();
  return NextResponse.json({ success: true });
}
