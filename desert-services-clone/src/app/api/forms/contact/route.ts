import { NextResponse } from "next/server";

import { getResend, getResendAddresses } from "@/lib/resend";
import { contactFormSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = contactFormSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 }
      );
    }

    const { firstName, lastName, phone, email, message, honeypot } =
      result.data;

    // Honeypot: if filled, act successful but do nothing.
    if (honeypot) {
      return NextResponse.json({ success: true });
    }

    const { from, to } = getResendAddresses();
    const resend = getResend();

    const subject = `Website Contact: ${firstName} ${lastName}`;
    const text = [
      `Name: ${firstName} ${lastName}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      "",
      "Message:",
      message,
    ].join("\n");

    await resend.emails.send({
      from,
      to,
      replyTo: email,
      subject,
      text,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
