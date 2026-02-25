import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const month = Number(searchParams.get("month") || new Date().getMonth() + 1);
  const year = Number(searchParams.get("year") || new Date().getFullYear());

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const expenses = await prisma.expense.findMany({
    where: {
      dueDate: { gte: startDate, lte: endDate },
    },
    include: { category: true },
    orderBy: { dueDate: "asc" },
  });

  const totalARS = expenses
    .filter((e) => e.currency === "ARS")
    .reduce((sum, e) => sum + e.amount, 0);

  const totalUSD = expenses
    .filter((e) => e.currency === "USD")
    .reduce((sum, e) => sum + e.amount, 0);

  const paidARS = expenses
    .filter((e) => e.currency === "ARS" && e.paid)
    .reduce((sum, e) => sum + e.amount, 0);

  const paidUSD = expenses
    .filter((e) => e.currency === "USD" && e.paid)
    .reduce((sum, e) => sum + e.amount, 0);

  const pendingARS = totalARS - paidARS;
  const pendingUSD = totalUSD - paidUSD;

  // Group by category for chart
  const byCategory = expenses.reduce(
    (acc, e) => {
      const key = e.category.name;
      if (!acc[key]) {
        acc[key] = { name: key, color: e.category.color, ARS: 0, USD: 0 };
      }
      acc[key][e.currency as "ARS" | "USD"] += e.amount;
      return acc;
    },
    {} as Record<string, { name: string; color: string; ARS: number; USD: number }>
  );

  const upcoming = expenses
    .filter((e) => !e.paid && new Date(e.dueDate) >= new Date())
    .slice(0, 5);

  const overdue = expenses.filter(
    (e) => !e.paid && new Date(e.dueDate) < new Date()
  );

  return NextResponse.json({
    totals: { totalARS, totalUSD, paidARS, paidUSD, pendingARS, pendingUSD },
    byCategory: Object.values(byCategory),
    upcoming,
    overdue,
    expenseCount: expenses.length,
    paidCount: expenses.filter((e) => e.paid).length,
  });
}
