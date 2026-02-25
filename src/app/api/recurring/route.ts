import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const recurring = await prisma.recurringExpense.findMany({
    include: { category: true },
    orderBy: { dayOfMonth: "asc" },
  });
  return NextResponse.json(recurring);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const recurring = await prisma.recurringExpense.create({
    data: {
      description: body.description,
      amount: body.amount,
      currency: body.currency || "ARS",
      categoryId: body.categoryId,
      dayOfMonth: body.dayOfMonth,
      active: body.active ?? true,
      notes: body.notes || null,
    },
    include: { category: true },
  });

  return NextResponse.json(recurring, { status: 201 });
}
