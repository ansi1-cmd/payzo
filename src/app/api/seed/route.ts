import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@libsql/client";

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'receipt',
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "categoryId" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "RecurringExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "categoryId" TEXT NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecurringExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
`;

const categories = [
  { name: "Agua", icon: "droplets", color: "#3b82f6" },
  { name: "Luz", icon: "zap", color: "#eab308" },
  { name: "Gas", icon: "flame", color: "#f97316" },
  { name: "Internet", icon: "wifi", color: "#8b5cf6" },
  { name: "Teléfono", icon: "smartphone", color: "#06b6d4" },
  { name: "Netflix", icon: "tv", color: "#ef4444" },
  { name: "Spotify", icon: "music", color: "#22c55e" },
  { name: "YouTube Premium", icon: "play", color: "#ef4444" },
  { name: "Otras suscripciones", icon: "repeat", color: "#a855f7" },
  { name: "Tarjeta Visa", icon: "credit-card", color: "#1e40af" },
  { name: "Tarjeta Mastercard", icon: "credit-card", color: "#dc2626" },
  { name: "Tarjeta Amex", icon: "credit-card", color: "#2563eb" },
  { name: "Impuestos", icon: "landmark", color: "#64748b" },
  { name: "Seguros", icon: "shield", color: "#14b8a6" },
  { name: "Otro", icon: "ellipsis", color: "#94a3b8" },
];

async function seed() {
  try {
    const url = process.env.TURSO_DATABASE_URL ?? "file:prisma/dev.db";
    const authToken = process.env.TURSO_AUTH_TOKEN;

    const client = createClient({
      url,
      ...(authToken ? { authToken } : {}),
    });

    // Step 1: Create tables
    const statements = MIGRATION_SQL.split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await client.execute(stmt);
    }

    // Step 2: Seed categories
    let seeded = 0;
    for (const cat of categories) {
      const id = cat.name.toLowerCase().replace(/\s+/g, "-");
      await client.execute({
        sql: `INSERT OR IGNORE INTO "Category" ("id", "name", "icon", "color", "createdAt") VALUES (?, ?, ?, ?, datetime('now'))`,
        args: [id, cat.name, cat.icon, cat.color],
      });
      seeded++;
    }

    return NextResponse.json({
      message: `Tables created and ${seeded} categories seeded`,
      success: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}

export async function GET() {
  return seed();
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-seed-secret");
  if (process.env.SEED_SECRET && secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return seed();
}
