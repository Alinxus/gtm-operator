/**
 * Email sending via SMTP (nodemailer) or Resend fallback
 * Handles outbound sequences + delivery event webhooks
 */

import nodemailer from "nodemailer";

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  tags?: Record<string, string>;
}

export interface SendEmailResult {
  id: string;
}

// ---------------------------------------------------------------------------
// SMTP client (Spacemail / any SMTP provider)
// ---------------------------------------------------------------------------

export class SmtpEmailClient {
  private readonly fromHeader: string;
  private readonly transporter: nodemailer.Transporter;

  constructor(options: {
    host: string;
    port: number;
    user: string;
    pass: string;
    fromName: string;
    fromAddress: string;
  }) {
    this.fromHeader = `${options.fromName} <${options.fromAddress}>`;
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.port === 465,
      auth: { user: options.user, pass: options.pass },
    });
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const info = await this.transporter.sendMail({
      from: this.fromHeader,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });
    return { id: info.messageId ?? info.response ?? "sent" };
  }

  async sendBatch(emails: SendEmailInput[]): Promise<SendEmailResult[]> {
    const results: SendEmailResult[] = [];
    for (const email of emails) {
      results.push(await this.send(email));
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// Resend client (kept as fallback / for webhook parsing)
// ---------------------------------------------------------------------------

export class ResendEmailClient {
  constructor(
    private readonly options: {
      apiKey: string;
      fromAddress: string;
      fromName: string;
    },
  ) {}

  get from() {
    return `${this.options.fromName} <${this.options.fromAddress}>`;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const body: Record<string, unknown> = {
      from: this.from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
    };
    if (input.html) body.html = input.html;
    if (input.replyTo) body.reply_to = input.replyTo;
    if (input.tags) body.tags = Object.entries(input.tags).map(([name, value]) => ({ name, value }));

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Resend send failed ${res.status}: ${text}`);
    }

    const data = (await res.json()) as { id: string };
    return { id: data.id };
  }

  async sendBatch(emails: SendEmailInput[]): Promise<SendEmailResult[]> {
    if (emails.length === 0) return [];
    const chunks = chunk(emails, 100);
    const results: SendEmailResult[] = [];
    for (const batch of chunks) {
      const body = batch.map((input) => {
        const item: Record<string, unknown> = {
          from: this.from,
          to: [input.to],
          subject: input.subject,
          text: input.text,
        };
        if (input.html) item.html = input.html;
        if (input.replyTo) item.reply_to = input.replyTo;
        if (input.tags) item.tags = Object.entries(input.tags).map(([name, value]) => ({ name, value }));
        return item;
      });

      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`Resend batch failed ${res.status}: ${text}`);
      }

      const data = (await res.json()) as { data: Array<{ id: string }> };
      results.push(...data.data.map((d) => ({ id: d.id })));
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// Resend webhook event parser
// ---------------------------------------------------------------------------

export type ResendEventType =
  | "email.sent"
  | "email.delivered"
  | "email.opened"
  | "email.clicked"
  | "email.bounced"
  | "email.complained";

export interface ResendWebhookEvent {
  type: ResendEventType;
  data: {
    email_id: string;
    from?: string;
    to?: string[];
    subject?: string;
    tags?: Record<string, string>;
    bounce?: { message?: string };
    click?: { link?: string };
  };
}

export function parseResendWebhookEvent(body: unknown): ResendWebhookEvent | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.type !== "string" || !b.data) return null;
  return b as unknown as ResendWebhookEvent;
}

export async function verifyResendWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature) return false;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const sigBytes = hexToBytes(signature.replace(/^sha256=/, ""));
    return await crypto.subtle.verify("HMAC", key, sigBytes.buffer as ArrayBuffer, encoder.encode(rawBody));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Simple markdown-to-HTML for email bodies
// ---------------------------------------------------------------------------

export function markdownToEmailHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");
}
