import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  try {
    // Check if any user exists (initialized)
    const userCount = await prisma.user.count();
    const initialized = userCount > 0;

    // Check if current session is valid
    const user = await getCurrentUser();
    const authenticated = !!user;

    return NextResponse.json({
      initialized,
      authenticated,
      user: user
        ? {
            id: user.id,
            username: user.username,
            email: user.email,
            createdAt: user.createdAt,
          }
        : null,
    });
  } catch (error) {
    console.error("Auth status error:", error);
    return NextResponse.json(
      { error: "Failed to check auth status" },
      { status: 500 }
    );
  }
}
