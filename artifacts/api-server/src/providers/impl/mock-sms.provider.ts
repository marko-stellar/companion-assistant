/**
 * MockSMSProvider — selected explicitly by SMS_MODE=mock.
 *
 * Simulates successful delivery so the full safety-escalation pipeline
 * (classify → persist → escalate → record delivery) can be exercised
 * without a real SMS credential. Safe in any environment because results are
 * persistently labelled SIMULATED.
 *
 * Privacy: logs only the redacted destination and message length —
 * never the message content (which contains conversation evidence).
 */

import { randomUUID } from "crypto";
import type {
  NotificationProvider,
  SendSMSParams,
  SendSMSResult,
} from "../notification.provider";

function redactPhone(phone: string): string {
  return phone.length > 4 ? `${"*".repeat(phone.length - 3)}${phone.slice(-3)}` : "***";
}

export class MockSMSProvider implements NotificationProvider {
  async sendSMS({ to, message, safetyEventId }: SendSMSParams): Promise<SendSMSResult> {
    console.info(
      `[mock-sms] simulated delivery to ${redactPhone(to)} (event ${safetyEventId}, ${message.length} chars)`,
    );
    return { success: true, simulated: true, providerMessageId: `mock-${randomUUID()}` };
  }
}
