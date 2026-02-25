const PDF_TIMEOUT_MS = 15_000;

export async function extractTextFromPDF(
  buffer: Buffer,
  password?: string
): Promise<string> {
  const { PDFParse } = await import("pdf-parse");

  const parser = new PDFParse({
    data: new Uint8Array(buffer),
    password: password || undefined,
  });

  try {
    const result = await Promise.race([
      parser.getText(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("PDF extraction timeout")), PDF_TIMEOUT_MS)
      ),
    ]);
    return result.text;
  } finally {
    await parser.destroy();
  }
}
