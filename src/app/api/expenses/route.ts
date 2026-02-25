import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const month = searchParams.get("month");
  const year = searchParams.get("year");
  const paid = searchParams.get("paid");

  const where: Record<string, unknown> = {};

  if (month && year) {
    const startDate = new Date(Number(year), Number(month) - 1, 1);
    const endDate = new Date(Number(year), Number(month), 0, 23, 59, 59);
    where.dueDate = { gte: startDate, lte: endDate };
  }

  if (paid !== null && paid !== undefined && paid !== "") {
    where.paid = paid === "true";
  }

  const expenses = await prisma.expense.findMany({
    where,
    include: { category: true },
    orderBy: { dueDate: "asc" },
  });

  return NextResponse.json(expenses);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const expense = await prisma.expense.create({
    data: {
      description: body.description,
      amount: body.amount,
      currency: body.currency || "ARS",
      categoryId: body.categoryId,
      dueDate: new Date(body.dueDate),
      paid: body.paid || false,
      paidDate: body.paid ? new Date() : null,
      notes: body.notes || null,
    },
    include: { category: true },
  });

  return NextResponse.json(expense, { status: 201 });
}
