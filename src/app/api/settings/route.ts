import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Get all settings or specific setting
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (key) {
    const setting = await prisma.setting.findUnique({
      where: { key },
    });
    return NextResponse.json(setting?.value ?? null);
  }

  const settings = await prisma.setting.findMany();
  const result: Record<string, string> = {};
  for (const setting of settings) {
    result[setting.key] = setting.value;
  }
  return NextResponse.json(result);
}

// Update settings
export async function POST(request: NextRequest) {
  const body = await request.json();

  const updates: { key: string; value: string }[] = [];

  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") {
      updates.push({ key, value });
    }
  }

  for (const { key, value } of updates) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  return NextResponse.json({ success: true });
}

// Delete a setting
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "Key is required" }, { status: 400 });
  }

  await prisma.setting.delete({
    where: { key },
  }).catch(() => {
    // Ignore if not found
  });

  return NextResponse.json({ success: true });
}
