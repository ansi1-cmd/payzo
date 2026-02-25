import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  fetchEmailsFromSenders,
  fetchEmailsByKeywords,
} from "@/lib/gmail";
import { KNOWN_SENDERS, SUBJECT_KEYWORDS } from "@/lib/email-senders";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json(
      { error: "Gmail no está configurado" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const daysBack = (body as { daysBack?: number }).daysBack || 30;

  try {
    // Clear any stale pending emails from previous incomplete runs
    await prisma.pendingEmail.deleteMany({});

    const senderEmails = KNOWN_SENDERS.map((s) => s.email);
    const senderLookup = new Map(
      KNOWN_SENDERS.map((s) => [s.email.toLowerCase(), s])
    );

    // ── PASO 1: Emails de remitentes conocidos (whitelist) ──
    const whitelistEmails = await fetchEmailsFromSenders(
      senderEmails,
      daysBack
    );

    // ── PASO 2: Emails por keywords en asunto ──
    const keywordEmails = await fetchEmailsByKeywords(
      SUBJECT_KEYWORDS,
      senderEmails,
      daysBack
    );

    // Get already processed message IDs
    const allMessageIds = [
      ...whitelistEmails.map((e) => e.messageId),
      ...keywordEmails.map((e) => e.messageId),
    ];

    const processedIds = await prisma.processedEmail.findMany({
      where: { messageId: { in: allMessageIds } },
      select: { messageId: true },
    });
    const processedSet = new Set(processedIds.map((p) => p.messageId));

    // Store unprocessed emails as pending (deduplicate by messageId)
    let pendingCount = 0;
    const insertedIds = new Set<string>();

    for (const email of whitelistEmails) {
      if (processedSet.has(email.messageId)) continue;
      if (insertedIds.has(email.messageId)) continue;
      insertedIds.add(email.messageId);

      const knownSender = senderLookup.get(email.from.toLowerCase());
      const pdfPassword = knownSender?.pdfPasswordEnvVar
        ? process.env[knownSender.pdfPasswordEnvVar] || undefined
        : undefined;

      const attachmentsJson = email.attachments.map((att) => ({
        filename: att.filename,
        contentBase64: att.content.toString("base64"),
      }));

      const data = {
        messageId: email.messageId,
        subject: email.subject,
        sender: email.from,
        textContent: email.text,
        htmlContent: email.html,
        attachments: JSON.stringify(attachmentsJson),
        source: "whitelist",
        senderName: knownSender?.name,
        categoryHint: knownSender?.category,
        pdfPassword,
      };

      await prisma.pendingEmail.upsert({
        where: { messageId: email.messageId },
        update: data,
        create: data,
      });
      pendingCount++;
    }

    for (const email of keywordEmails) {
      if (processedSet.has(email.messageId)) continue;
      if (insertedIds.has(email.messageId)) continue;
      insertedIds.add(email.messageId);

      const data = {
        messageId: email.messageId,
        subject: email.subject,
        sender: email.from,
        textContent: email.text,
        htmlContent: email.html,
        attachments: "[]",
        source: "keyword",
        senderName: null as string | null,
        categoryHint: null as string | null,
        pdfPassword: null as string | null,
      };

      await prisma.pendingEmail.upsert({
        where: { messageId: email.messageId },
        update: data,
        create: data,
      });
      pendingCount++;
    }

    return NextResponse.json({
      pending: pendingCount,
      skipped: processedSet.size,
      whitelistFound: whitelistEmails.length,
      keywordFound: keywordEmails.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Error al buscar emails: ${message}` },
      { status: 500 }
    );
  }
}
