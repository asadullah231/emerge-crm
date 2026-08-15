/**
 * Prepare an uploaded CV for a given provider. Anthropic reads PDFs natively
 * (layout + scanned pages), so we hand it the raw PDF. OpenAI-compatible
 * providers get extracted text (PDF via unpdf, DOCX via mammoth).
 */
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export type PreparedInput = { mode: "pdf-native"; base64: string } | { mode: "text"; text: string };

export async function prepareInput(
  buffer: Buffer,
  mime: string,
  filename: string,
  native: "anthropic" | "openai"
): Promise<PreparedInput> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const isPdf = mime === "application/pdf" || ext === "pdf";

  if (isPdf && native === "anthropic") {
    return { mode: "pdf-native", base64: buffer.toString("base64") };
  }
  if (isPdf) {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    const merged = (Array.isArray(text) ? text.join("\n") : text).trim();
    if (!merged) {
      throw new Error("No text found in PDF (scanned image?). Use an Anthropic provider for image PDFs.");
    }
    return { mode: "text", text: merged };
  }
  if (
    mime.includes("wordprocessingml") ||
    mime === "application/msword" ||
    ext === "docx" ||
    ext === "doc"
  ) {
    const { value } = await mammoth.extractRawText({ buffer });
    const text = value.trim();
    if (!text) throw new Error("No text extracted from document");
    return { mode: "text", text };
  }
  const text = buffer.toString("utf8").trim();
  if (!text) throw new Error("Empty file");
  return { mode: "text", text };
}
