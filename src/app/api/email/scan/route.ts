import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  fetchEmailsFromSenders,
  fetchEmailsByKeywords,
} from "@/lib/gmail";
import { parseEmailWithLLM } from "@/lib/llm";
import { extractTextFromPDF } from "@/lib/pdf";
import { KNOWN_SENDERS, SUBJECT_KEYWORDS } from "@/lib/email-senders";

export const maxDuration = 60;

interface StoredAttachment {
  filename: string;
  contentBase64: string;
}

/**
 * Full scan for Vercel Cron — fetches + processes all in one request.
 * Cron functions get up to 60s on Hobby, 300s on Pro.
 * For manual use, prefer /api/email/fetch + /api/email/process loop.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json(
      { error: "Gmail no está configurado" },
      { status: 400 }
    );
  }

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "Groq API key no está configurada" },
      { status: 400 }
    );
  }

  try {
    const senderEmails = KNOWN_SENDERS.map((s) => s.email);
    const senderLookup = new Map(
      KNOWN_SENDERS.map((s) => [s.email.toLowerCase(), s])
    );

    // Fetch from IMAP
    const whitelistEmails = await fetchEmailsFromSenders(senderEmails, 30);
    const keywordEmails = await fetchEmailsByKeywords(
      SUBJECT_KEYWORDS,
      senderEmails,
      30
    );

    const allEmails = [
      ...whitelistEmails.map((e) => ({ ...e, source: "whitelist" as const })),
      ...keywordEmails.map((e) => ({ ...e, source: "keyword" as const })),
    ];

    // Filter already processed
    const processedIds = await prisma.processedEmail.findMany({
      where: { messageId: { in: allEmails.map((e) => e.messageId) } },
      select: { messageId: true },
    });
    const processedSet = new Set(processedIds.map((p) => p.messageId));
    const unprocessed = allEmails.filter(
      (e) => !processedSet.has(e.messageId)
    );

    const categories = await prisma.category.findMany({
      select: { id: true, name: true },
    });

    let created = 0;
    let notInvoice = 0;
    let errors = 0;

    for (let i = 0; i < unprocessed.length; i++) {
      const email = unprocessed[i];

      try {
        const knownSender = senderLookup.get(email.from.toLowerCase());

        let pdfContent: string | undefined;
        if (email.attachments.length > 0) {
          const pdfPassword = knownSender?.pdfPasswordEnvVar
            ? process.env[knownSender.pdfPasswordEnvVar]
            : undefined;

          for (const att of email.attachments) {
            try {
              const text = await extractTextFromPDF(att.content, pdfPassword);
              pdfContent = (pdfContent || "") + text;
            } catch {
              /* skip failed PDFs */
            }
          }
        }

        const parsed = await parseEmailWithLLM(
          email.subject,
          email.text || email.html,
          email.from,
          categories,
          {
            pdfContent,
            senderName: knownSender?.name,
            categoryHint: knownSender?.category,
          }
        );

        if (!parsed.isInvoice) {
          await prisma.processedEmail.create({
            data: {
              messageId: email.messageId,
              subject: email.subject,
              sender: email.from,
              result: "not_invoice",
            },
          });
          notInvoice++;
          continue;
        }

        const categoryExists = categories.find(
          (c) => c.id === parsed.categoryId
        );
        const categoryId = categoryExists
          ? parsed.categoryId!
          : categories.find((c) => c.name === "Otro")?.id || categories[0].id;

        const expense = await prisma.expense.create({
          data: {
            description: parsed.description || email.subject,
            amount: parsed.amount || 0,
            currency: parsed.currency || "ARS",
            categoryId,
            dueDate: parsed.dueDate
              ? new Date(parsed.dueDate + "T12:00:00Z")
              : new Date(),
            source: "email",
            emailMessageId: email.messageId,
          },
        });

        await prisma.processedEmail.create({
          data: {
            messageId: email.messageId,
            subject: email.subject,
            sender: email.from,
            result: "created",
            expenseId: expense.id,
          },
        });
        created++;
      } catch {
        errors++;
      }
    }

    return NextResponse.json({
      message: `Cron: ${created} creados, ${notInvoice} no facturas, ${processedSet.size} ya procesados, ${errors} errores`,
      created,
      notInvoice,
      skipped: processedSet.size,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Error en cron scan: ${message}` },
      { status: 500 }
    );
  }
}
