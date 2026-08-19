/**
 * TwilioSMSProvider — real SMS delivery through the Twilio REST API.
 *
 * Config (env, never sent to clients):
 *   TWILIO_ACCOUNT_SID  TWILIO_AUTH_TOKEN  TWILIO_PHONE_NUMBER
 *
 * No SDK dependency — a single form-encoded POST to the Messages endpoint.
 * Failures are returned explicitly (success: false) — never thrown as a
 * silent success and never logged with message content.
 */

import type {
  NotificationProvider,
  SendSMSParams,
  SendSMSResult,
} from "../notification.provider";

export class TwilioSMSProvider implements NotificationProvider {
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;

  constructor() {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;
    if (!sid || !token || !from) {
      throw new Error(
        "TwilioSMSProvider requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER",
      );
    }
    this.accountSid = sid;
    this.authToken = token;
    this.fromNumber = from;
  }

  /** Hard cap on provider I/O so an urgent conversation reply is never blocked indefinitely. */
  private static readonly REQUEST_TIMEOUT_MS = 10_000;

  async sendSMS({ to, message }: SendSMSParams): Promise<SendSMSResult> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TwilioSMSProvider.REQUEST_TIMEOUT_MS);
    try {
      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
      const body = new URLSearchParams({
        To: to,
        From: this.fromNumber,
        Body: message,
      });

      const resp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
          signal: abort.signal,
        },
      );

      const json = (await resp.json().catch(() => ({}))) as {
        sid?: string;
        message?: string;
        code?: number;
      };

      if (!resp.ok) {
        return {
          success: false,
          error: `Twilio error ${resp.status}${json.code ? ` (code ${json.code})` : ""}: ${json.message ?? "delivery failed"}`,
        };
      }

      return { success: true, providerMessageId: json.sid };
    } catch (err) {
      // Timeout or network failure AFTER the request went out: Twilio may
      // still have accepted the message. Mark ambiguous so callers never
      // auto-retry into a duplicate SMS.
      if (abort.signal.aborted) {
        return {
          success: false,
          ambiguous: true,
          error: `Twilio request timed out after ${TwilioSMSProvider.REQUEST_TIMEOUT_MS}ms — delivery status unknown`,
        };
      }
      return {
        success: false,
        ambiguous: true,
        error: `Twilio request failed before a response was received — delivery status unknown (${err instanceof Error ? err.name : "unknown error"})`,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
