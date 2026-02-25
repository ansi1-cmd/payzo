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
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
