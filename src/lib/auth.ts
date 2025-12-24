import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function validatePassword(password: string): {
  valid: boolean;
  error?: string;
} {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    };
  }
  return { valid: true };
}

export function validateEmail(email: string): {
  valid: boolean;
  error?: string;
} {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return {
      valid: false,
      error: "Invalid email format",
    };
  }
  return { valid: true };
}

export function validateUsername(username: string): {
  valid: boolean;
  error?: string;
} {
  if (!username || username.length < 1 || username.length > 20) {
    return {
      valid: false,
      error: "Username must be 1-20 characters",
    };
  }

  // Allow letters, numbers, underscores, and CJK characters
  const usernameRegex = /^[\w\u4e00-\u9fff\u3400-\u4dbf]+$/;
  if (!usernameRegex.test(username)) {
    return {
      valid: false,
      error: "Username contains invalid characters",
    };
  }

  return { valid: true };
}
