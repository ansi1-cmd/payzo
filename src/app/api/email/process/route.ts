import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseEmailWithLLM } from "@/lib/llm";
import { extractTextFromPDF } from "@/lib/pdf";

export const maxDuration = 60;

interface StoredAttachment {
  filename: string;
  contentBase64: string;
}

export async function POST() {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "Groq API key no está configurada" },
      { status: 400 }
    );
  }

  try {
    // Pick the oldest pending email
    const pending = await prisma.pendingEmail.findFirst({
      orderBy: { createdAt: "asc" },
    });

    if (!pending) {
      return NextResponse.json({ done: true, remaining: 0 });
    }

    const remaining = await prisma.pendingEmail.count();

    // Get categories for Gemini
    const categories = await prisma.category.findMany({
      select: { id: true, name: true },
    });

    // Extract PDF content if there are attachments
    let pdfContent: string | undefined;
    const attachments: StoredAttachment[] = JSON.parse(pending.attachments);

    if (attachments.length > 0) {
      for (const att of attachments) {
        try {
          const buffer = Buffer.from(att.contentBase64, "base64");
          const text = await extractTextFromPDF(
            buffer,
            pending.pdfPassword || undefined
          );
          pdfContent = (pdfContent || "") + text;
        } catch (pdfError) {
          console.error(
            `Error extrayendo PDF "${att.filename}" de ${pending.sender}:`,
            pdfError instanceof Error ? pdfError.message : pdfError
          );
        }
      }
    }

    // Parse with LLM
    const parsed = await parseEmailWithLLM(
      pending.subject,
      pending.textContent || pending.htmlContent,
      pending.sender,
      categories,
      {
        pdfContent,
        senderName: pending.senderName || undefined,
        categoryHint: pending.categoryHint || undefined,
      }
    );

    // Delete from pending regardless of result
    await prisma.pendingEmail.delete({ where: { id: pending.id } });

    if (!parsed.isInvoice) {
      await prisma.processedEmail.create({
        data: {
          messageId: pending.messageId,
          subject: pending.subject,
          sender: pending.sender,
          result: "not_invoice",
        },
      });

      return NextResponse.json({
        done: false,
        remaining: remaining - 1,
        result: {
          messageId: pending.messageId,
          subject: pending.subject,
          from: pending.sender,
          source: pending.source,
          result: "not_invoice" as const,
        },
      });
    }

    // Validate category
    const categoryExists = categories.find((c) => c.id === parsed.categoryId);
    const categoryId = categoryExists
      ? parsed.categoryId!
      : categories.find((c) => c.name === "Otro")?.id || categories[0].id;

    // Create expense
    const expense = await prisma.expense.create({
      data: {
        description: parsed.description || pending.subject,
        amount: parsed.amount || 0,
        currency: parsed.currency || "ARS",
        categoryId,
        dueDate: parsed.dueDate
          ? new Date(parsed.dueDate + "T12:00:00Z")
          : new Date(),
        source: "email",
        emailMessageId: pending.messageId,
      },
    });

    await prisma.processedEmail.create({
      data: {
        messageId: pending.messageId,
        subject: pending.subject,
        sender: pending.sender,
        result: "created",
        expenseId: expense.id,
      },
    });

    return NextResponse.json({
      done: false,
      remaining: remaining - 1,
      result: {
        messageId: pending.messageId,
        subject: pending.subject,
        from: pending.sender,
        source: pending.source,
        result: "created" as const,
        expenseId: expense.id,
        description: parsed.description,
        amount: parsed.amount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Error al procesar email: ${message}` },
      { status: 500 }
    );
  }
}
