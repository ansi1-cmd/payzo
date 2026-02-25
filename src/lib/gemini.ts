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

export async function parseEmailWithGemini(
  subject: string,
  body: string,
  from: string,
  categories: Category[]
): Promise<ParsedExpense> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const categoryList = categories
    .map((c) => `- id: "${c.id}", nombre: "${c.name}"`)
    .join("\n");

  const prompt = `Sos un asistente que analiza emails para detectar facturas, boletas, resúmenes de cuenta, o cualquier notificación de pago/cobro.

Analiza el siguiente email y determiná si es una factura, boleta, resumen de tarjeta, aviso de vencimiento, o notificación de cobro.

**De:** ${from}
**Asunto:** ${subject}
**Contenido:**
${body.slice(0, 3000)}

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

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

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
