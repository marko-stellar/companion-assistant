/**
 * UnavailableSMSProvider — selected when no real SMS credential is
 * configured outside development. Always fails explicitly so a safety
 * event is recorded with a visible FAILED delivery status instead of
 * being silently marked sent.
 */

import type {
  NotificationProvider,
  SendSMSParams,
  SendSMSResult,
} from "../notification.provider";

export class UnavailableSMSProvider implements NotificationProvider {
  async sendSMS(_params: SendSMSParams): Promise<SendSMSResult> {
    return {
      success: false,
      error:
        "No SMS provider configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER to enable family alerts.",
    };
  }
}
