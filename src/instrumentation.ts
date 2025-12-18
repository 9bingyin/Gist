export async function register() {
  // Only run on server
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAutoRefresh } = await import("@/lib/auto-refresh");
    await startAutoRefresh();
  }
}
