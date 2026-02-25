import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { ParsedMail } from "mailparser";

export interface EmailMessage {
  messageId: string;
  subject: string;
  from: string;
  date: Date;
  text: string;
  html: string;
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
        const parsed = (await simpleParser(msg.source as unknown as Buffer)) as unknown as ParsedMail;

        const fromAddress =
          parsed.from?.value?.[0]?.address || parsed.from?.text || "unknown";

        emails.push({
          messageId: parsed.messageId || msg.uid.toString(),
          subject: parsed.subject || "(sin asunto)",
          from: fromAddress,
          date: parsed.date || new Date(),
          text: parsed.text || "",
          html: typeof parsed.html === "string" ? parsed.html : "",
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
