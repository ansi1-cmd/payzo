# Plan: Filtro por remitentes conocidos + procesamiento de PDFs adjuntos

## Resumen

Reemplazar el escaneo genérico de emails (todos los no leídos) por un sistema de **whitelist de remitentes conocidos**. Para estos remitentes se buscan emails leídos y no leídos, se extraen adjuntos PDF (incluyendo PDFs con contraseña), y se envía todo a Gemini para análisis.

---

## Paso 1: Crear configuración de remitentes conocidos

**Archivo nuevo:** `src/lib/email-senders.ts`

Definir un array tipado con la config de cada remitente:

```typescript
export interface KnownSender {
  email: string;          // dirección del remitente
  name: string;           // nombre legible
  category: string;       // hint de categoría para Gemini
  hasAttachment?: boolean; // si esperamos PDFs adjuntos
  pdfPasswordEnvVar?: string; // nombre de la env var con password del PDF
}

export const KNOWN_SENDERS: KnownSender[] = [
  // Servicios
  { email: "noresponder@facturas.edesur.com.ar", name: "Edesur", category: "Luz" },
  { email: "avisos@aysadigital.com.ar", name: "Aysa", category: "Agua" },
  { email: "no-reply@metrogas.com.ar", name: "Metrogas", category: "Gas" },
  { email: "difusion@quilmes.gov.ar", name: "Municipalidad Quilmes", category: "Impuestos" },
  // Tarjetas
  { email: "mensajesyavisos@mails.santander.com.ar", name: "Santander", category: "Visa" },
  { email: "eresumen@icbc.com.ar", name: "ICBC", category: "Visa", hasAttachment: true },
  { email: "tarjetasupervielle@e-resumen.com", name: "Supervielle", category: "Visa" },
  { email: "NAVI@mailing.bna.com.ar", name: "Banco Nación", category: "Visa", hasAttachment: true, pdfPasswordEnvVar: "BNA_PDF_PASSWORD" },
  // Suscripciones
  { email: "no_reply@email.apple.com", name: "Apple iCloud+", category: "Otras suscripciones" },
];
```

---

## Paso 2: Instalar dependencia `pdf-parse`

```bash
npm install pdf-parse
npm install -D @types/pdf-parse  # (si existe, sino ignorar)
```

Librería liviana que usa pdf.js internamente. Soporta PDFs con contraseña via opción `password`.

---

## Paso 3: Crear utilidad de procesamiento de PDF

**Archivo nuevo:** `src/lib/pdf.ts`

```typescript
import pdf from "pdf-parse";

export async function extractTextFromPDF(
  buffer: Buffer,
  password?: string
): Promise<string> {
  const options: pdf.Options = {};
  if (password) options.password = password;
  const data = await pdf(buffer, options);
  return data.text;
}
```

---

## Paso 4: Modificar `src/lib/gmail.ts`

### 4a. Actualizar interface `EmailMessage`

Agregar campo para contenido de adjuntos:

```typescript
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
  attachments: EmailAttachment[];  // NUEVO
}
```

### 4b. Nueva función `fetchEmailsFromSenders()`

- Recibe `senderEmails: string[]` y `daysBack: number`
- Conecta UNA vez a IMAP
- Busca con `{ since, from: sender }` (SIN `seen: false`)
- Extrae adjuntos PDF del email parseado
- Devuelve emails con sus adjuntos

```
Para cada sender:
  IMAP SEARCH: FROM "sender@email.com" SINCE <date>
  Para cada mensaje encontrado:
    Parsear con simpleParser
    Extraer text, html, attachments (filtrar solo application/pdf)
    Push al array de resultados
```

Se hace una sola conexión IMAP y se busca por cada sender dentro del mismo lock.

### 4c. Mantener `fetchRecentEmails()` como fallback (sin romper nada existente)

---

## Paso 5: Modificar `src/lib/gemini.ts`

### 5a. Actualizar `parseEmailWithGemini()` para aceptar contenido PDF

Agregar parámetro opcional `pdfContent?: string`.

Si hay contenido PDF, incluirlo en el prompt:

```
**Contenido del PDF adjunto:**
${pdfContent.slice(0, 5000)}
```

Esto le da a Gemini el texto extraído del PDF para encontrar montos, fechas de vencimiento, etc.

### 5b. Agregar hint de categoría del sender

Pasar el nombre del sender conocido y la categoría sugerida en el prompt para mejorar la precisión.

---

## Paso 6: Modificar `src/app/api/email/scan/route.ts`

### 6a. Importar nueva config y utilidades

```typescript
import { KNOWN_SENDERS } from "@/lib/email-senders";
import { fetchEmailsFromSenders } from "@/lib/gmail";
import { extractTextFromPDF } from "@/lib/pdf";
```

### 6b. Cambiar flujo principal

```
1. Obtener lista de emails de KNOWN_SENDERS (usa fetchEmailsFromSenders)
2. Deduplicar con ProcessedEmail (sin cambios)
3. Para cada email no procesado:
   a. Buscar el KnownSender que matchea el from
   b. Si tiene adjuntos PDF → extraer texto (con password si aplica)
   c. Enviar a Gemini: subject + body + pdfText + categoryHint
   d. Crear expense si es factura (sin cambios)
```

### 6c. Mantener GET handler para cron (sin cambios)

---

## Paso 7: Variable de entorno

Agregar a `.env`:

```
BNA_PDF_PASSWORD=40676541
```

La contraseña del PDF de Banco Nación se almacena como variable de entorno, no hardcodeada.

---

## Resumen de archivos a modificar/crear

| Archivo | Acción |
|---------|--------|
| `src/lib/email-senders.ts` | **CREAR** - Config de remitentes |
| `src/lib/pdf.ts` | **CREAR** - Utilidad PDF |
| `src/lib/gmail.ts` | **MODIFICAR** - Nueva función + attachments |
| `src/lib/gemini.ts` | **MODIFICAR** - Aceptar PDF content |
| `src/app/api/email/scan/route.ts` | **MODIFICAR** - Nuevo flujo |
| `.env` | **MODIFICAR** - Agregar BNA_PDF_PASSWORD |
| `package.json` | **MODIFICAR** - Agregar pdf-parse |

---

## Beneficios

- **Solo 9 remitentes** en vez de miles de emails → rápido y barato en API calls
- **Sin filtro de leído/no leído** → no te perdés facturas que ya viste
- **PDFs adjuntos** → extrae datos de resúmenes de tarjeta de ICBC y BNA
- **Contraseña de PDF** → maneja el caso de BNA automáticamente
- **Extensible** → agregar un nuevo remitente es agregar una línea al array
- **Deduplicación existente** sigue funcionando → no reprocesa emails
