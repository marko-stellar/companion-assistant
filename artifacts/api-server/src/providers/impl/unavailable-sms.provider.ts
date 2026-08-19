/**
 * UnavailableSMSProvider — selected when SMS_MODE=real but the Twilio
 * credentials are incomplete. Always fails explicitly so a safety event is
 * recorded with a visible FAILED delivery status instead of being silently
 * marked sent.
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
        "SMS_MODE=real requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER to enable family alerts.",
    };
  }
}
