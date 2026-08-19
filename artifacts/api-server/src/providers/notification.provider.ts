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
  /**
   * true when delivery was only simulated (development mock). Callers MUST
   * NOT present a simulated result as a real family notification.
   */
  simulated?: boolean;
  /**
   * true when the outcome is unknown (e.g. timeout after the request may
   * have been accepted by the provider). Callers MUST NOT auto-retry an
   * ambiguous send — that risks duplicate real messages; surface it for
   * manual verification instead.
   */
  ambiguous?: boolean;
}

export interface NotificationProvider {
  sendSMS(params: SendSMSParams): Promise<SendSMSResult>;
}
