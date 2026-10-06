/**
 * OOP Domain Model: Queue Management & Room Allocation
 * Real-time clinic queue tracking, room dispatch, and queue event streaming
 */

export enum QueueStatus {
  REGISTERED = "REGISTERED",
  TRIAGE_WAITING = "TRIAGE_WAITING",
  CALLED_TO_ROOM = "CALLED_TO_ROOM",
  IN_CONSULTATION = "IN_CONSULTATION",
  DISPENSARY_WAITING = "DISPENSARY_WAITING",
  PAYMENT_WAITING = "PAYMENT_WAITING",
  COMPLETED = "COMPLETED",
  NO_SHOW = "NO_SHOW"
}

export interface ConsultationRoom {
  readonly roomId: string;
  readonly roomNumber: string;       // e.g. "Room 01", "Treatment Suite A"
  readonly attendingPractitionerId: string;
  isOccupied: boolean;
}

export class QueueTicket {
  private readonly _ticketId: string;
  private readonly _ticketNumber: string; // e.g. "Q-104"
  private readonly _patientId: string;
  private _status: QueueStatus;
  private _allocatedRoom?: ConsultationRoom;
  private _assignedPractitionerId: string;
  private readonly _createdAt: Date;
  private _calledAt?: Date;

  constructor(
    ticketId: string,
    ticketNumber: string,
    patientId: string,
    assignedPractitionerId: string
  ) {
    if (!ticketId) throw new Error("Ticket ID required.");
    if (!ticketNumber) throw new Error("Ticket number required.");
    this._ticketId = ticketId;
    this._ticketNumber = ticketNumber;
    this._patientId = patientId;
    this._assignedPractitionerId = assignedPractitionerId;
    this._status = QueueStatus.REGISTERED;
    this._createdAt = new Date();
  }

  public get ticketId(): string { return this._ticketId; }
  public get ticketNumber(): string { return this._ticketNumber; }
  public get patientId(): string { return this._patientId; }
  public get status(): QueueStatus { return this._status; }
  public get allocatedRoom(): ConsultationRoom | undefined { return this._allocatedRoom; }
  public get assignedPractitionerId(): string { return this._assignedPractitionerId; }
  public get calledAt(): Date | undefined { return this._calledAt; }

  /**
   * Room Allocation & Call Action (Triggers Live Screen & WhatsApp Alert)
   */
  public callToRoom(room: ConsultationRoom): void {
    if (this._status === QueueStatus.COMPLETED || this._status === QueueStatus.NO_SHOW) {
      throw new Error(`Cannot call ticket ${this._ticketNumber}: Ticket already closed.`);
    }
    this._allocatedRoom = room;
    this._status = QueueStatus.CALLED_TO_ROOM;
    this._calledAt = new Date();
    room.isOccupied = true;
  }

  public startConsultation(): void {
    if (this._status !== QueueStatus.CALLED_TO_ROOM) {
      throw new Error("Patient must be called to room before starting consultation.");
    }
    this._status = QueueStatus.IN_CONSULTATION;
  }

  public routeToDispensaryAndPayment(): void {
    if (this._allocatedRoom) {
      this._allocatedRoom.isOccupied = false;
    }
    this._status = QueueStatus.DISPENSARY_WAITING;
  }

  public markCompleted(): void {
    this._status = QueueStatus.COMPLETED;
  }
}
