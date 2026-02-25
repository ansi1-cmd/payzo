import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { ParsedMail } from "mailparser";

export interface EmailAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface EmailMessage {
  messageId: string;
  subject: string;
  from: string;
  date: Date;
  text: string;
  html: string;
  attachments: EmailAttachment[];
}

export async function fetchRecentEmails(
  daysBack: number = 7
): Promise<EmailMessage[]> {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER!,
      pass: process.env.GMAIL_APP_PASSWORD!,
    },
    logger: false,
  });

  const emails: EmailMessage[] = [];

  try {
    await client.connect();

    const lock = await client.getMailboxLock("INBOX");

    try {
      const since = new Date();
      since.setDate(since.getDate() - daysBack);

      const messages = client.fetch(
        { since, seen: false },
        { source: true, envelope: true }
      );

      for await (const msg of messages) {
        const parsed = (await simpleParser(
          msg.source as unknown as Buffer
        )) as unknown as ParsedMail;

        const fromAddress =
          parsed.from?.value?.[0]?.address || parsed.from?.text || "unknown";

        emails.push({
          messageId: parsed.messageId || msg.uid.toString(),
          subject: parsed.subject || "(sin asunto)",
          from: fromAddress,
          date: parsed.date || new Date(),
          text: parsed.text || "",
          html: typeof parsed.html === "string" ? parsed.html : "",
          attachments: [],
        });
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (error) {
    try {
      await client.logout();
    } catch {
      // ignore logout errors
    }
    throw error;
  }

  return emails;
}

export async function fetchEmailsFromSenders(
  senderEmails: string[],
  daysBack: number = 30
): Promise<EmailMessage[]> {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER!,
      pass: process.env.GMAIL_APP_PASSWORD!,
    },
    logger: false,
  });

  const emails: EmailMessage[] = [];

  try {
    await client.connect();

    const lock = await client.getMailboxLock("INBOX");

    try {
      const since = new Date();
      since.setDate(since.getDate() - daysBack);

      for (const sender of senderEmails) {
        const uids = await client.search({
          since,
          from: sender,
        });

        if (!uids || !Array.isArray(uids) || uids.length === 0) continue;

        const messages = client.fetch(
          { uid: uids.join(",") },
          { source: true, envelope: true, uid: true }
        );

        for await (const msg of messages) {
          const parsed = (await simpleParser(
            msg.source as unknown as Buffer
          )) as unknown as ParsedMail;

          const fromAddress =
            parsed.from?.value?.[0]?.address || parsed.from?.text || "unknown";

          const pdfAttachments: EmailAttachment[] = (
            parsed.attachments || []
          )
            .filter(
              (att) =>
                att.contentType === "application/pdf" ||
                att.filename?.toLowerCase().endsWith(".pdf")
            )
            .map((att) => ({
              filename: att.filename || "attachment.pdf",
              contentType: att.contentType,
              content: att.content,
            }));

          emails.push({
            messageId: parsed.messageId || msg.uid.toString(),
            subject: parsed.subject || "(sin asunto)",
            from: fromAddress,
            date: parsed.date || new Date(),
            text: parsed.text || "",
            html: typeof parsed.html === "string" ? parsed.html : "",
            attachments: pdfAttachments,
          });
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (error) {
    try {
      await client.logout();
    } catch {
      // ignore logout errors
    }
    throw error;
  }

  return emails;
}
