import nodemailer from 'nodemailer';
import { pool, transaction } from './db.js';

type OutboxMessage = {
  id: number;
  channel: 'EMAIL' | 'WHATSAPP';
  template: string;
  recipient: string;
  payload: Record<string, unknown>;
  attempts: number;
};
interface NotificationChannel {
  configured(): boolean;
  send(message: OutboxMessage): Promise<string>;
}

function notificationText(message: OutboxMessage): string {
  if (message.template === 'BOOKING')
    return `Your appointment at ${String(message.payload.branchName || 'the clinic')} with ${String(message.payload.practitionerName || 'your practitioner')} is confirmed for ${new Date(String(message.payload.startsAt)).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })} MYT. Directions: ${String(message.payload.mapUrl || '')}. Contact the clinic to change your booking.`;
  if (message.template === 'ROOM_CALL')
    return `Your clinic queue ticket has been called. Please proceed to ${String(message.payload.roomName || 'your assigned room')}.`;
  if (message.template === 'QUEUE_NEAR')
    return 'Your clinic queue turn is approaching. Please return to the waiting lounge.';
  return 'Your medication supply is due to finish in three days. Contact the clinic to discuss a follow-up appointment.';
}

export class EmailNotificationChannel implements NotificationChannel {
  configured() {
    return Boolean(
      process.env.SMTP_HOST &&
      process.env.SMTP_FROM &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD,
    );
  }
  async send(message: OutboxMessage): Promise<string> {
    const port = Number(process.env.SMTP_PORT || 465);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      connectionTimeout: 10000,
      socketTimeout: 20000,
    });
    const calendar = appointmentCalendar(message);
    const result = await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: message.recipient,
      subject: 'Clinic notification',
      text: notificationText(message),
      attachments: calendar
        ? [
            {
              filename: 'clinic-appointment.ics',
              content: calendar,
              contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
            },
          ]
        : [],
    });
    if (!result.accepted.length) throw new Error('Email provider did not accept the recipient.');
    return String(result.messageId);
  }
}

/** Calendar contains operational appointment facts; no diagnosis or medication data. */
export function appointmentCalendar(message: OutboxMessage): string | null {
  if (message.template !== 'BOOKING') return null;
  const starts = new Date(String(message.payload.startsAt)),
    ends = new Date(String(message.payload.endsAt));
  if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || ends <= starts)
    return null;
  const utc = (date: Date) =>
    date
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  const escape = (value: unknown) =>
    String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Clinic Management System//Appointments//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${message.id}@clinic`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(starts)}`,
    `DTEND:${utc(ends)}`,
    `SUMMARY:${escape(message.payload.branchName || 'Clinic appointment')}`,
    `LOCATION:${escape(message.payload.branchAddress)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export class WhatsAppNotificationChannel implements NotificationChannel {
  private template(message: OutboxMessage) {
    return process.env[`WHATSAPP_TEMPLATE_${message.template}`];
  }
  configured() {
    return Boolean(
      process.env.WHATSAPP_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_API_VERSION,
    );
  }
  async send(message: OutboxMessage): Promise<string> {
    const templateName = this.template(message);
    if (!templateName)
      throw new Error('Approved WhatsApp template is missing for this notification type.');
    const version = process.env.WHATSAPP_API_VERSION!;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
    if (!/^v\d+\.\d+$/.test(version) || !/^\d+$/.test(phoneId))
      throw new Error('Invalid WhatsApp API configuration.');
    const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: message.recipient.replace(/[^\d]/g, ''),
        type: 'template',
        template: {
          name: templateName,
          language: { code: process.env.WHATSAPP_LANGUAGE || 'en' },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: notificationText(message) }] },
          ],
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new Error(`WhatsApp provider rejected notification (HTTP ${response.status}).`);
    const result = (await response.json()) as { messages?: { id: string }[] };
    if (!result.messages?.[0]?.id)
      throw new Error('WhatsApp provider returned no message identifier.');
    return result.messages[0].id;
  }
}

/** Durable outbox with short claims. SENT means provider acceptance, not confirmed delivery. */
export class NotificationDispatcher {
  constructor(
    private readonly channels: Record<'EMAIL' | 'WHATSAPP', NotificationChannel> = {
      EMAIL: new EmailNotificationChannel(),
      WHATSAPP: new WhatsAppNotificationChannel(),
    },
  ) {}

  async runOnce(limit = 25): Promise<number> {
    await this.enqueueApproachingQueueAlerts();
    // Recover abandoned leases. A timeout after provider acceptance can cause a duplicate; providers lack a shared idempotency contract.
    await pool.query(
      "UPDATE notification_outbox SET status='FAILED', last_error='Worker lease expired; retry pending' WHERE status='PROCESSING' AND available_at < UTC_TIMESTAMP(6)",
    );
    let processed = 0;
    for (let index = 0; index < limit; index++) {
      const message = await transaction(async (db) => {
        const { rows } = await db.query(
          "SELECT o.*,p.email current_email,p.phone current_phone FROM notification_outbox o JOIN patients p ON p.id=o.patient_id AND p.tenant_id=o.tenant_id WHERE o.status IN ('PENDING','FAILED') AND o.attempts<5 AND o.available_at<=UTC_TIMESTAMP(6) AND p.notification_consent=1 ORDER BY o.created_at LIMIT 1 FOR UPDATE SKIP LOCKED",
        );
        if (!rows[0]) return null;
        await db.query(
          "UPDATE notification_outbox SET status='PROCESSING', attempts=attempts+1, available_at=DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 2 MINUTE) WHERE id=$1",
          [rows[0].id],
        );
        const payload =
          typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload;
        if (rows[0].template === 'ROOM_CALL' && payload.roomId) {
          const room = await db.query(
            'SELECT name FROM rooms WHERE id=$1 AND tenant_id=$2 AND branch_id=$3',
            [payload.roomId, rows[0].tenant_id, rows[0].branch_id],
          );
          payload.roomName = room.rows[0]?.name;
        }
        return {
          ...rows[0],
          recipient: rows[0].channel === 'EMAIL' ? rows[0].current_email : rows[0].current_phone,
          payload,
          attempts: rows[0].attempts + 1,
        } as OutboxMessage;
      });
      if (!message) break;
      const channel = this.channels[message.channel];
      if (!channel.configured()) {
        await pool.query(
          "UPDATE notification_outbox SET status='UNCONFIGURED', last_error='Configure notification provider before retrying' WHERE id=$1",
          [message.id],
        );
      } else {
        try {
          const reference = await channel.send(message);
          await pool.query(
            "UPDATE notification_outbox SET status='SENT', provider_reference=$2, last_error=NULL WHERE id=$1",
            [message.id, reference],
          );
        } catch {
          const delaySeconds = Math.min(3600, 60 * 2 ** message.attempts);
          // Never persist recipient data, credentials, or untrusted provider response bodies in errors.
          await pool.query(
            "UPDATE notification_outbox SET status='FAILED', last_error='Provider delivery attempt failed; inspect provider configuration', available_at=DATE_ADD(UTC_TIMESTAMP(6), INTERVAL $2 SECOND) WHERE id=$1",
            [message.id, delaySeconds],
          );
        }
      }
      processed++;
    }
    return processed;
  }

  private async enqueueApproachingQueueAlerts() {
    // Rank each branch independently. Notify the next three tickets once; deduplication survives restarts.
    const { rows } = await pool.query(`SELECT ranked.*,p.email,p.phone FROM (
      SELECT q.id,q.tenant_id,q.branch_id,q.patient_id,ROW_NUMBER() OVER (PARTITION BY q.branch_id ORDER BY CASE WHEN q.priority='URGENT' THEN 0 ELSE 1 END,q.created_at,q.id) position
      FROM queue_tickets q WHERE q.status='TRIAGE_WAITING' AND q.service_date=DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR))
    ) ranked JOIN patients p ON p.id=ranked.patient_id AND p.tenant_id=ranked.tenant_id WHERE ranked.position<=3 AND p.notification_consent=1`);
    for (const ticket of rows)
      for (const [channel, recipient] of [
        ['EMAIL', ticket.email],
        ['WHATSAPP', ticket.phone],
      ]) {
        if (!recipient) continue;
        await pool.query(
          `INSERT IGNORE INTO notification_outbox(tenant_id,branch_id,patient_id,channel,template,recipient,payload,deduplication_key,available_at)
        VALUES($1,$2,$3,$4,'QUEUE_NEAR',$5,$6,$7,UTC_TIMESTAMP(6))`,
          [
            ticket.tenant_id,
            ticket.branch_id,
            ticket.patient_id,
            channel,
            recipient,
            JSON.stringify({ turnsAhead: Number(ticket.position) - 1 }),
            `queue-near:${ticket.id}:${channel}`,
          ],
        );
      }
  }
}
