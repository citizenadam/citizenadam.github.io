// Turns an uploaded posting into text. PDF and DOCX are parsed here so the
// browser never has to ship a parser and the file never leaves the request.
import { extractText, getDocumentProxy } from "unpdf";
import { unzipSync, strFromU8 } from "fflate";

const MAX_BYTES = 4 * 1024 * 1024;

export async function fileToText(name, base64) {
  const buf = Buffer.from(base64, "base64");
  if (buf.length > MAX_BYTES) throw new Error("That file is larger than 4 MB.");
  const lower = (name || "").toLowerCase();

  if (lower.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return String(text || "");
  }

  if (lower.endsWith(".docx")) {
    const files = unzipSync(new Uint8Array(buf));
    const doc = files["word/document.xml"];
    if (!doc) throw new Error("That DOCX has no document body.");
    const xml = strFromU8(doc);
    // Paragraph boundaries first, then strip tags and decode the entities that
    // actually appear in Word output.
    return xml
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".rtf")) {
    return buf.toString("utf8");
  }

  throw new Error("Upload a PDF, DOCX or plain text file.");
}
