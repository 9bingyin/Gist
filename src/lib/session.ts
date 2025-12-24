import { cookies } from "next/headers";
import { createHmac, randomBytes } from "crypto";
import { prisma } from "./db";

const SESSION_NAME = "gist_session";
const SESSION_SECRET =
  process.env.SESSION_SECRET || "fallback-secret-change-me-in-production";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

interface SessionData {
  userId: string;
  createdAt: number;
}

function sign(data: string): string {
  const hmac = createHmac("sha256", SESSION_SECRET);
  hmac.update(data);
  return hmac.digest("hex");
}

function verify(data: string, signature: string): boolean {
  const expected = sign(data);
  return expected === signature;
}

export async function createSession(userId: string): Promise<void> {
  const sessionData: SessionData = {
    userId,
    createdAt: Date.now(),
  };

  const data = JSON.stringify(sessionData);
  const signature = sign(data);
  const token = Buffer.from(data).toString("base64") + "." + signature;

  const cookieStore = await cookies();
  cookieStore.set(SESSION_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_NAME)?.value;

  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [dataBase64, signature] = parts;

  try {
    const data = Buffer.from(dataBase64, "base64").toString("utf-8");

    if (!verify(data, signature)) {
      return null;
    }

    const sessionData: SessionData = JSON.parse(data);

    // Check if session is expired
    const age = (Date.now() - sessionData.createdAt) / 1000;
    if (age > SESSION_MAX_AGE) {
      return null;
    }

    return sessionData;
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_NAME);
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      username: true,
      email: true,
      createdAt: true,
    },
  });

  return user;
}

export function generateSessionSecret(): string {
  return randomBytes(32).toString("hex");
}
