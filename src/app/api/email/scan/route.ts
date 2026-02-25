import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchEmailsFromSenders } from "@/lib/gmail";
import { parseEmailWithGemini, GEMINI_DELAY_MS } from "@/lib/gemini";
import { extractTextFromPDF } from "@/lib/pdf";
import { KNOWN_SENDERS } from "@/lib/email-senders";

interface ScanResult {
  messageId: string;
  subject: string;
  from: string;
  result: "created" | "skipped" | "not_invoice" | "error";
  expenseId?: string;
  description?: string;
  amount?: number;
  error?: string;
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

  try {
    // 1. Fetch emails only from known senders (read + unread)
    const senderEmails = KNOWN_SENDERS.map((s) => s.email);
    const emails = await fetchEmailsFromSenders(senderEmails, daysBack);

    // 2. Get already processed message IDs
    const processedIds = await prisma.processedEmail.findMany({
      where: {
        messageId: { in: emails.map((e) => e.messageId) },
      },
      select: { messageId: true },
    });
    const processedSet = new Set(processedIds.map((p) => p.messageId));

    // 3. Get categories for Gemini prompt
    const categories = await prisma.category.findMany({
      select: { id: true, name: true },
    });

    // 4. Build sender lookup (case-insensitive)
    const senderLookup = new Map(
      KNOWN_SENDERS.map((s) => [s.email.toLowerCase(), s])
    );

    // 5. Process each unprocessed email
    const unprocessed = emails.filter((e) => !processedSet.has(e.messageId));

    for (let i = 0; i < unprocessed.length; i++) {
      const email = unprocessed[i];

      // Rate limit: wait between Gemini calls to stay under free tier limits
      if (i > 0) {
        await new Promise((r) => setTimeout(r, GEMINI_DELAY_MS));
      }

      try {
        const knownSender = senderLookup.get(email.from.toLowerCase());

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

        // Parse with Gemini (with PDF content and sender hints)
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

          results.push({
            messageId: email.messageId,
            subject: email.subject,
            from: email.from,
            result: "not_invoice",
          });
          continue;
        }

        // Validate category exists
        const categoryExists = categories.find(
          (c) => c.id === parsed.categoryId
        );
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

        results.push({
          messageId: email.messageId,
          subject: email.subject,
          from: email.from,
          result: "created",
          expenseId: expense.id,
          description: parsed.description,
          amount: parsed.amount,
        });
      } catch (emailError) {
        const errMsg =
          emailError instanceof Error ? emailError.message : "Unknown error";

        results.push({
          messageId: email.messageId,
          subject: email.subject,
          from: email.from,
          result: "error",
          error: errMsg,
        });
      }
    }

    const created = results.filter((r) => r.result === "created").length;
    const skipped = processedSet.size;
    const notInvoice = results.filter((r) => r.result === "not_invoice").length;

    return NextResponse.json({
      message: `Escaneo completado: ${created} gastos creados, ${notInvoice} no eran facturas, ${skipped} ya procesados`,
      totalEmails: emails.length,
      created,
      skipped,
      notInvoice,
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
