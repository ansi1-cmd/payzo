import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.description !== undefined) data.description = body.description;
  if (body.amount !== undefined) data.amount = body.amount;
  if (body.currency !== undefined) data.currency = body.currency;
  if (body.categoryId !== undefined) data.categoryId = body.categoryId;
  if (body.dueDate !== undefined) data.dueDate = new Date(body.dueDate);
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.paid !== undefined) {
    data.paid = body.paid;
    data.paidDate = body.paid ? new Date() : null;
  }

  const expense = await prisma.expense.update({
    where: { id },
    data,
    include: { category: true },
  });

  return NextResponse.json(expense);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.expense.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
