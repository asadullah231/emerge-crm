/**
 * Turn an uploaded CV file into something the Claude parser can read.
 *
 * PDFs are handed to Claude directly as a document block (it reads layout and
 * even scanned pages, which beats brittle text extraction). DOCX is unwrapped
 * to text with mammoth. TXT/RTF/other are passed through as UTF-8 text (Claude
 * copes with RTF control words fine).
 */
import mammoth from "mammoth";

export type ExtractResult =
  | { mode: "pdf"; base64: string }
  | { mode: "text"; text: string };

export async function extractForParse(
  buffer: Buffer,
  mime: string,
  filename: string
): Promise<ExtractResult> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (mime === "application/pdf" || ext === "pdf") {
    return { mode: "pdf", base64: buffer.toString("base64") };
  }
  if (
    mime.includes("wordprocessingml") ||
    mime === "application/msword" ||
    ext === "docx" ||
    ext === "doc"
  ) {
    // mammoth handles .docx; .doc (legacy binary) usually throws -> caller triages.
    const { value } = await mammoth.extractRawText({ buffer });
    const text = value.trim();
    if (!text) throw new Error("no text extracted from document");
    return { mode: "text", text };
  }
  const text = buffer.toString("utf8").trim();
  if (!text) throw new Error("empty file");
  return { mode: "text", text };
}
