import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const month = body.month as number;
  const year = body.year as number;

  const activeRecurring = await prisma.recurringExpense.findMany({
    where: { active: true },
  });

  const created = [];

  for (const rec of activeRecurring) {
    const lastDay = new Date(year, month, 0).getDate();
    const day = Math.min(rec.dayOfMonth, lastDay);
    const dueDate = new Date(year, month - 1, day);

    const existing = await prisma.expense.findFirst({
      where: {
        description: rec.description,
        categoryId: rec.categoryId,
        dueDate: {
          gte: new Date(year, month - 1, 1),
          lte: new Date(year, month - 1, lastDay, 23, 59, 59),
        },
      },
    });

    if (!existing) {
      const expense = await prisma.expense.create({
        data: {
          description: rec.description,
          amount: rec.amount,
          currency: rec.currency,
          categoryId: rec.categoryId,
          dueDate,
        },
        include: { category: true },
      });
      created.push(expense);
    }
  }

  return NextResponse.json({
    message: `Se generaron ${created.length} gastos para ${month}/${year}`,
    created,
  });
}
