import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  fetchEmailsFromSenders,
  fetchEmailsByKeywords,
  type EmailMessage,
} from "@/lib/gmail";
import { parseEmailWithGemini, GEMINI_DELAY_MS } from "@/lib/gemini";
import { extractTextFromPDF } from "@/lib/pdf";
import { KNOWN_SENDERS, SUBJECT_KEYWORDS } from "@/lib/email-senders";
import type { KnownSender } from "@/lib/email-senders";

interface ScanResult {
  messageId: string;
  subject: string;
  from: string;
  result: "created" | "skipped" | "not_invoice" | "error";
  source?: "whitelist" | "keyword";
  expenseId?: string;
  description?: string;
  amount?: number;
  error?: string;
}

async function processEmail(
  email: EmailMessage,
  categories: { id: string; name: string }[],
  knownSender: KnownSender | undefined,
  geminiCallIndex: number
): Promise<ScanResult> {
  // Rate limit: wait between Gemini calls
  if (geminiCallIndex > 0) {
    await new Promise((r) => setTimeout(r, GEMINI_DELAY_MS));
  }

  // Extract PDF text if the email has attachments
  let pdfContent: string | undefined;
  if (email.attachments.length > 0) {
    const pdfPassword = knownSender?.pdfPasswordEnvVar
      ? process.env[knownSender.pdfPasswordEnvVar]
      : undefined;

    for (const att of email.attachments) {
      try {
        const text = await extractTextFromPDF(att.content, pdfPassword);
        pdfContent = (pdfContent || "") + text;
      } catch (pdfError) {
        console.error(
          `Error extrayendo PDF "${att.filename}" de ${email.from}:`,
          pdfError instanceof Error ? pdfError.message : pdfError
        );
      }
    }
  }

  // Parse with Gemini
  const parsed = await parseEmailWithGemini(
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

    return {
      messageId: email.messageId,
      subject: email.subject,
      from: email.from,
      result: "not_invoice",
      source: knownSender ? "whitelist" : "keyword",
    };
  }

  // Validate category exists
  const categoryExists = categories.find((c) => c.id === parsed.categoryId);
  const categoryId = categoryExists
    ? parsed.categoryId!
    : categories.find((c) => c.name === "Otro")?.id || categories[0].id;

  // Create the expense
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

  return {
    messageId: email.messageId,
    subject: email.subject,
    from: email.from,
    result: "created",
    source: knownSender ? "whitelist" : "keyword",
    expenseId: expense.id,
    description: parsed.description,
    amount: parsed.amount,
  };
}

export async function POST(request: NextRequest) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json(
      { error: "Gmail no está configurado" },
      { status: 400 }
    );
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "Gemini API key no está configurada" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const daysBack = (body as { daysBack?: number }).daysBack || 30;

  const results: ScanResult[] = [];
  const senderLookup = new Map(
    KNOWN_SENDERS.map((s) => [s.email.toLowerCase(), s])
  );

  try {
    const categories = await prisma.category.findMany({
      select: { id: true, name: true },
    });

    // ── PASO 1: Emails de remitentes conocidos (whitelist) ──
    const senderEmails = KNOWN_SENDERS.map((s) => s.email);
    const whitelistEmails = await fetchEmailsFromSenders(
      senderEmails,
      daysBack
    );

    // Filter already processed
    const whitelistIds = whitelistEmails.map((e) => e.messageId);
    const processedWhitelist = await prisma.processedEmail.findMany({
      where: { messageId: { in: whitelistIds } },
      select: { messageId: true },
    });
    const processedSet = new Set(processedWhitelist.map((p) => p.messageId));

    const unprocessedWhitelist = whitelistEmails.filter(
      (e) => !processedSet.has(e.messageId)
    );

    let geminiCallIndex = 0;

    for (const email of unprocessedWhitelist) {
      try {
        const knownSender = senderLookup.get(email.from.toLowerCase());
        const result = await processEmail(
          email,
          categories,
          knownSender,
          geminiCallIndex++
        );
        results.push(result);
      } catch (emailError) {
        results.push({
          messageId: email.messageId,
          subject: email.subject,
          from: email.from,
          result: "error",
          source: "whitelist",
          error:
            emailError instanceof Error ? emailError.message : "Unknown error",
        });
      }
    }

    // ── PASO 2: Emails por keywords en asunto (excluir whitelist) ──
    const keywordEmails = await fetchEmailsByKeywords(
      SUBJECT_KEYWORDS,
      senderEmails,
      daysBack
    );

    // Filter already processed
    const keywordIds = keywordEmails.map((e) => e.messageId);
    const processedKeywords = await prisma.processedEmail.findMany({
      where: { messageId: { in: keywordIds } },
      select: { messageId: true },
    });
    const processedKeywordSet = new Set(
      processedKeywords.map((p) => p.messageId)
    );

    const unprocessedKeywords = keywordEmails.filter(
      (e) => !processedKeywordSet.has(e.messageId)
    );

    for (const email of unprocessedKeywords) {
      try {
        const result = await processEmail(
          email,
          categories,
          undefined,
          geminiCallIndex++
        );
        results.push(result);
      } catch (emailError) {
        results.push({
          messageId: email.messageId,
          subject: email.subject,
          from: email.from,
          result: "error",
          source: "keyword",
          error:
            emailError instanceof Error ? emailError.message : "Unknown error",
        });
      }
    }

    const created = results.filter((r) => r.result === "created").length;
    const skippedWhitelist = processedSet.size;
    const skippedKeywords = processedKeywordSet.size;
    const notInvoice = results.filter(
      (r) => r.result === "not_invoice"
    ).length;

    return NextResponse.json({
      message: `Escaneo completado: ${created} gastos creados, ${notInvoice} no eran facturas, ${skippedWhitelist + skippedKeywords} ya procesados`,
      totalEmails: whitelistEmails.length + keywordEmails.length,
      created,
      skipped: skippedWhitelist + skippedKeywords,
      notInvoice,
      whitelistEmails: whitelistEmails.length,
      keywordEmails: keywordEmails.length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Error al escanear emails: ${message}` },
      { status: 500 }
    );
  }
}

// GET handler for Vercel Cron
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fakeRequest = new NextRequest(request.url, {
    method: "POST",
    body: JSON.stringify({ daysBack: 30 }),
  });

  return POST(fakeRequest);
}
