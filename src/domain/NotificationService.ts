/**
 * OOP Domain Model: Multi-Channel Automated Notification Engine
 * Handles WhatsApp & Email alerts for Bookings, Queue bumps, and Post-Visit Medication Refills
 * Follows Strategy & Observer Design Patterns
 */

export type NotificationChannelType = "WHATSAPP" | "EMAIL";

export interface NotificationMessagePayload {
  readonly recipientPhoneOrEmail: string;
  readonly templateType: "BOOKING_CONFIRMATION" | "QUEUE_STATUS_UPDATE" | "MEDICATION_REFILL_REMINDER";
  readonly patientName: string;
  readonly dynamicVariables: Record<string, string>;
}

export interface NotificationDeliveryResult {
  readonly messageId: string;
  readonly channel: NotificationChannelType;
  readonly isDelivered: boolean;
  readonly timestamp: Date;
}

export interface INotificationChannelStrategy {
  readonly channelType: NotificationChannelType;
  sendMessage(payload: NotificationMessagePayload): Promise<NotificationDeliveryResult>;
}

export class WhatsAppNotificationStrategy implements INotificationChannelStrategy {
  public readonly channelType = "WHATSAPP";

  async sendMessage(payload: NotificationMessagePayload): Promise<NotificationDeliveryResult> {
    // In production: Connect to WhatsApp Cloud API / Twilio
    return {
      messageId: `WA-${Date.now()}`,
      channel: this.channelType,
      isDelivered: true,
      timestamp: new Date()
    };
  }
}

export class EmailNotificationStrategy implements INotificationChannelStrategy {
  public readonly channelType = "EMAIL";

  async sendMessage(payload: NotificationMessagePayload): Promise<NotificationDeliveryResult> {
    // In production: Connect to AWS SES / SendGrid / Postmark
    return {
      messageId: `EM-${Date.now()}`,
      channel: this.channelType,
      isDelivered: true,
      timestamp: new Date()
    };
  }
}

export class ClinicAlertDispatcher {
  private readonly _strategies: Map<NotificationChannelType, INotificationChannelStrategy> = new Map();

  constructor(strategies: INotificationChannelStrategy[]) {
    strategies.forEach(s => this._strategies.set(s.channelType, s));
  }

  /**
   * 1. Appointment Booking Confirmation Alert
   */
  public async dispatchBookingConfirmation(
    phone: string,
    email: string,
    patientName: string,
    appointmentTime: string,
    doctorName: string,
    branchLocation: string
  ): Promise<void> {
    const payload: NotificationMessagePayload = {
      recipientPhoneOrEmail: phone,
      templateType: "BOOKING_CONFIRMATION",
      patientName,
      dynamicVariables: {
        appointmentTime,
        doctorName,
        branchLocation,
        calendarLink: `https://clinic.local/cal?id=${Date.now()}`
      }
    };
    await this._strategies.get("WHATSAPP")?.sendMessage(payload);
    if (email) {
      await this._strategies.get("EMAIL")?.sendMessage({ ...payload, recipientPhoneOrEmail: email });
    }
  }

  /**
   * 2. Real-Time Queue Status Alert ("2 turns away" or "Please proceed to Room X")
   */
  public async dispatchQueueStatusUpdate(
    phone: string,
    patientName: string,
    ticketNumber: string,
    patientsAhead: number,
    allocatedRoom?: string
  ): Promise<void> {
    const payload: NotificationMessagePayload = {
      recipientPhoneOrEmail: phone,
      templateType: "QUEUE_STATUS_UPDATE",
      patientName,
      dynamicVariables: {
        ticketNumber,
        patientsAhead: patientsAhead.toString(),
        room: allocatedRoom || "Waiting Area",
        estimatedMinutes: (patientsAhead * 10).toString()
      }
    };
    await this._strategies.get("WHATSAPP")?.sendMessage(payload);
  }

  /**
   * 3. Post-Visit Automated Medication Refill Reminder (e.g. 3 days before supply ends)
   */
  public async dispatchMedicationRefillReminder(
    phone: string,
    patientName: string,
    medicationName: string,
    daysRemaining: number,
    refillOrderUrl: string
  ): Promise<void> {
    const payload: NotificationMessagePayload = {
      recipientPhoneOrEmail: phone,
      templateType: "MEDICATION_REFILL_REMINDER",
      patientName,
      dynamicVariables: {
        medicationName,
        daysRemaining: daysRemaining.toString(),
        refillUrl: refillOrderUrl
      }
    };
    await this._strategies.get("WHATSAPP")?.sendMessage(payload);
  }
}
