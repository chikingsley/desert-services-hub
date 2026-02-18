import { db } from "@lib/db/hub";
import { getFileCategory } from "./file-categories";
import { processImage } from "./processors/image";
import { processOfficeDocument } from "./processors/office";
import { processPdf } from "./processors/pdf";
import { processTextFile } from "./processors/text";
import { processZipFile } from "./processors/zip";
import type {
  ContractsEmailIntakePayload,
  EmailMeta,
  ParseIntakeResult,
} from "./types";

export type { ContractsEmailIntakePayload, ParseIntakeResult } from "./types";

const LOG = "[files-intake]";

const insertUnsupported = db.prepare(`
  INSERT INTO documents (
    document_type, file_path, file_name,
    extraction_status,
    original_from, original_subject, forwarder_email
  ) VALUES ('unsupported', $1, $2, 'unsupported', $3, $4, $5)
  RETURNING id
`);

async function processUnsupported(
  filePath: string,
  emailMeta: EmailMeta
): Promise<ParseIntakeResult> {
  const fileName = filePath.split("/").pop() ?? filePath;

  const row = (await insertUnsupported.get(
    filePath,
    fileName,
    emailMeta.originalFrom || null,
    emailMeta.originalSubject || null,
    emailMeta.forwarderEmail || null
  )) as { id: number } | null;

  return {
    documentId: row?.id ?? null,
    fileName,
    documentType: "unsupported",
    pageCount: 0,
    processingTimeMs: 0,
  };
}

export async function processFilesIntake(
  payload: ContractsEmailIntakePayload
): Promise<ParseIntakeResult[]> {
  const { attachmentPaths, originalSubject, originalFrom, forwarderEmail } =
    payload;

  const pdfs: string[] = [];
  const images: string[] = [];
  const office: string[] = [];
  const texts: string[] = [];
  const zips: string[] = [];
  const others: string[] = [];

  for (const path of attachmentPaths) {
    switch (getFileCategory(path)) {
      case "pdf":
        pdfs.push(path);
        break;
      case "image":
        images.push(path);
        break;
      case "office":
        office.push(path);
        break;
      case "text":
        texts.push(path);
        break;
      case "zip":
        zips.push(path);
        break;
      default:
        others.push(path);
    }
  }

  console.log(
    `${LOG} Processing ${attachmentPaths.length} file(s): ${pdfs.length} PDF, ${images.length} image, ${office.length} office, ${texts.length} text, ${zips.length} zip, ${others.length} other`
  );

  const emailMeta: EmailMeta = {
    originalFrom: originalFrom ?? "",
    originalSubject: originalSubject ?? "",
    forwarderEmail: forwarderEmail ?? "",
  };

  const results: ParseIntakeResult[] = [];

  for (const pdfPath of pdfs) {
    results.push(await processPdf(pdfPath, emailMeta));
  }

  for (const imagePath of images) {
    results.push(await processImage(imagePath, emailMeta));
  }

  for (const officePath of office) {
    results.push(await processOfficeDocument(officePath, emailMeta));
  }

  for (const zipPath of zips) {
    const zipResults = await processZipFile(
      zipPath,
      emailMeta,
      payload,
      processFilesIntake
    );
    results.push(...zipResults);
  }

  for (const textPath of texts) {
    results.push(await processTextFile(textPath, emailMeta));
  }

  for (const otherPath of others) {
    results.push(await processUnsupported(otherPath, emailMeta));
  }

  return results;
}
