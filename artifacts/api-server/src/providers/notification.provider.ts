/**
 * NotificationProvider — interface for outbound notifications.
 *
 * IMPORTANT MVP constraint:
 * SMS must only be sent when conversation content independently classifies
 * as requiring emergency contact. Routine deviation alone is never sufficient.
 */

export interface SendSMSParams {
  /** E.164 phone number, e.g. "+38591..." */
  to: string;
  message: string;
  /** Reference for audit logging */
  safetyEventId: string;
}

export interface SendSMSResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface NotificationProvider {
  sendSMS(params: SendSMSParams): Promise<SendSMSResult>;
}
