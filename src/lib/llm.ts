import Groq from "groq-sdk";

interface Category {
  id: string;
  name: string;
}

export interface ParsedExpense {
  isInvoice: boolean;
  description?: string;
  amount?: number;
  currency?: string;
  categoryId?: string;
  dueDate?: string;
  confidence?: number;
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callWithRetry(
  prompt: string,
  maxRetries: number = 2
): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      });
      return result.choices[0]?.message?.content?.trim() ?? "";
    } catch (error: unknown) {
      const errMsg =
        error instanceof Error ? error.message : String(error);
      const is429 =
        errMsg.includes("429") || errMsg.includes("Too Many Requests");

      if (is429 && attempt < maxRetries) {
        const waitTime = (attempt + 1) * 2000; // 2s, 4s
        console.log(
          `Groq rate limit hit, esperando ${waitTime / 1000}s (intento ${attempt + 1}/${maxRetries})...`
        );
        await sleep(waitTime);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

export async function parseEmailWithLLM(
  subject: string,
  body: string,
  from: string,
  categories: Category[],
  options?: { pdfContent?: string; senderName?: string; categoryHint?: string }
): Promise<ParsedExpense> {
  const categoryList = categories
    .map((c) => `- id: "${c.id}", nombre: "${c.name}"`)
    .join("\n");

  let contentSection = `**Contenido del email:**\n${body.slice(0, 3000)}`;

  if (options?.pdfContent) {
    contentSection += `\n\n**Contenido del PDF adjunto:**\n${options.pdfContent.slice(0, 5000)}`;
  }

  const senderHint = options?.senderName
    ? `\n**IMPORTANTE: Este email es de un remitente conocido: ${options.senderName}.**${options.categoryHint ? ` Normalmente corresponde a la categoría "${options.categoryHint}".` : ""} Los emails de este remitente casi siempre son facturas, resúmenes o avisos de cobro. Clasificalo como isInvoice: true a menos que sea CLARAMENTE un email de marketing, promoción o notificación irrelevante.`
    : "";

  const prompt = `Sos un asistente que analiza emails para detectar facturas, boletas, resúmenes de cuenta, o cualquier notificación de pago/cobro.

Analiza el siguiente email y determiná si es una factura, boleta, resumen de tarjeta, aviso de vencimiento, o notificación de cobro.

**De:** ${from}
**Asunto:** ${subject}
${contentSection}
${senderHint}

**Categorías disponibles:**
${categoryList}

Si es una factura/cobro, respondé SOLO con este JSON (sin markdown, sin backticks):
{
  "isInvoice": true,
  "description": "descripción corta del gasto",
  "amount": 1234.56,
  "currency": "ARS" o "USD",
  "categoryId": "id-de-la-categoria-mas-adecuada",
  "dueDate": "YYYY-MM-DD",
  "confidence": 0.95
}

Si NO es una factura/cobro, respondé SOLO:
{"isInvoice": false}

Reglas:
- La descripción debe ser corta y clara (ej: "Factura Edenor Febrero", "Netflix mensual")
- Si no encontrás el monto exacto, estimá o poné 0
- Si no encontrás fecha de vencimiento, usá la fecha de hoy: ${new Date().toISOString().split("T")[0]}
- Elegí la categoría más apropiada de la lista
- currency debe ser "ARS" o "USD"
- confidence es un número entre 0 y 1 indicando qué tan seguro estás`;

  const text = await callWithRetry(prompt);

  try {
    const cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    return JSON.parse(cleaned) as ParsedExpense;
  } catch {
    console.error(
      `[llm] Failed to parse LLM response as JSON. Raw response: "${text.slice(0, 500)}"`
    );
    return { isInvoice: false };
  }
}
