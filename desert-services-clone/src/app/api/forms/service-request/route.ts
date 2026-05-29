import { NextResponse } from "next/server";

import { getResend, getResendAddresses } from "@/lib/resend";
import { serviceRequestFormSchema } from "@/lib/schemas";

export const runtime = "nodejs";

function getString(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function getStrings(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

interface Attachment {
  filename: string;
  content: string;
}

async function filesToAttachments(files: unknown[]) {
  const attachments: Attachment[] = [];

  const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
  let totalBytes = 0;

  for (const f of files) {
    const file = f as {
      name?: string;
      size?: number;
      arrayBuffer?: () => Promise<ArrayBuffer>;
    } | null;
    if (!file?.arrayBuffer) {
      continue;
    }

    const size = typeof file.size === "number" ? file.size : 0;
    totalBytes += size;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return { attachments: [], truncated: true };
    }

    const buf = Buffer.from(await file.arrayBuffer());
    attachments.push({
      filename: file.name || "attachment",
      content: buf.toString("base64"),
    });
  }

  return { attachments, truncated: false };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const raw = {
      generalContractor: getString(formData, "generalContractor") || undefined,
      projectName: getString(formData, "projectName"),
      contactName: getString(formData, "contactName"),
      contactPhone: getString(formData, "contactPhone"),
      contactEmail: getString(formData, "contactEmail"),
      projectAddress: getString(formData, "projectAddress"),
      servicesRequested: getStrings(formData, "servicesRequested[]"),
      honeypot: getString(formData, "honeypot") || undefined,
    };

    const result = serviceRequestFormSchema.safeParse(raw);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 }
      );
    }

    const data = result.data;

    // Honeypot: if filled, act successful but do nothing.
    if (data.honeypot) {
      return NextResponse.json({ success: true });
    }

    const uploadedFiles = formData.getAll("constructionPlans[]");
    const { attachments, truncated } = await filesToAttachments(uploadedFiles);

    const { from, to } = getResendAddresses();
    const resend = getResend();

    const subject = `Service Request: ${data.projectName}`;
    const text = [
      `Project Name: ${data.projectName}`,
      `General Contractor: ${data.generalContractor || "(not provided)"}`,
      `Contact Name: ${data.contactName}`,
      `Contact Email: ${data.contactEmail}`,
      `Contact Phone: ${data.contactPhone}`,
      `Project Address: ${data.projectAddress}`,
      `Services Requested: ${data.servicesRequested?.length ? data.servicesRequested.join(", ") : "(none selected)"}`,
      "",
      `Uploaded Files: ${uploadedFiles.length}`,
      truncated
        ? "NOTE: Attachments exceeded the size limit and were omitted."
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    await resend.emails.send({
      from,
      to,
      replyTo: data.contactEmail,
      subject,
      text,
      attachments,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to send request" },
      { status: 500 }
    );
  }
}
