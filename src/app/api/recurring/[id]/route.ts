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
  if (body.dayOfMonth !== undefined) data.dayOfMonth = body.dayOfMonth;
  if (body.active !== undefined) data.active = body.active;
  if (body.notes !== undefined) data.notes = body.notes;

  const recurring = await prisma.recurringExpense.update({
    where: { id },
    data,
    include: { category: true },
  });

  return NextResponse.json(recurring);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.recurringExpense.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
