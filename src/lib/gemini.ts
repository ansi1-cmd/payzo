import { GoogleGenerativeAI } from "@google/generative-ai";

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

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGeminiWithRetry(
  model: ReturnType<typeof genAI.getGenerativeModel>,
  prompt: string,
  maxRetries: number = 2
): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (error: unknown) {
      const errMsg =
        error instanceof Error ? error.message : String(error);
      const is429 = errMsg.includes("429") || errMsg.includes("Too Many Requests");

      if (is429 && attempt < maxRetries) {
        const waitTime = (attempt + 1) * 2000; // 2s, 4s
        console.log(
          `Gemini rate limit hit, esperando ${waitTime / 1000}s (intento ${attempt + 1}/${maxRetries})...`
        );
        await sleep(waitTime);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

// Delay between calls to stay under 15 RPM free tier limit
export const GEMINI_DELAY_MS = 5000;

export async function parseEmailWithGemini(
  subject: string,
  body: string,
  from: string,
  categories: Category[],
  options?: { pdfContent?: string; senderName?: string; categoryHint?: string }
): Promise<ParsedExpense> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const categoryList = categories
    .map((c) => `- id: "${c.id}", nombre: "${c.name}"`)
    .join("\n");

  let contentSection = `**Contenido del email:**\n${body.slice(0, 3000)}`;

  if (options?.pdfContent) {
    contentSection += `\n\n**Contenido del PDF adjunto:**\n${options.pdfContent.slice(0, 5000)}`;
  }

  const senderHint = options?.senderName
    ? `\nNota: Este email es de **${options.senderName}**${options.categoryHint ? `, que normalmente corresponde a la categoría "${options.categoryHint}"` : ""}.`
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

  const text = await callGeminiWithRetry(model, prompt);

  try {
    const cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    return JSON.parse(cleaned) as ParsedExpense;
  } catch {
    return { isInvoice: false };
  }
}
