#!/usr/bin/env bun
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import * as readline from "readline";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function question(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  console.log("Gist Password Reset Tool\n");

  const user = await prisma.user.findFirst();

  if (!user) {
    console.error("Error: No user found. Please run the application first to create a user.");
    process.exit(1);
  }

  console.log(`Found user: ${user.username} (${user.email})\n`);

  const newPassword = await question("Enter new password (min 8 characters): ");

  if (newPassword.length < 8) {
    console.error("Error: Password must be at least 8 characters.");
    process.exit(1);
  }

  const confirm = await question("Confirm new password: ");

  if (newPassword !== confirm) {
    console.error("Error: Passwords do not match.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hash },
  });

  console.log("\nPassword updated successfully!");
}

main()
  .catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
