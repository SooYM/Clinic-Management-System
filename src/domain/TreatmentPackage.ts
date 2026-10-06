/**
 * OOP Domain Model: Treatment Package Aggregate
 * Handles Prepaid Treatment Packages, Session Redemptions, and Expiry Invariants
 */

export interface SessionRedemptionRecord {
  readonly redemptionId: string;
  readonly sessionNumber: number;
  readonly redeemedAt: Date;
  readonly practitionerId: string; // Attending Doctor or Aesthetic Therapist
  readonly roomOrBranchId: string;
  readonly patientSignatureVerification: boolean;
  readonly treatmentNotes: string;
}

export class TreatmentPackage {
  private readonly _id: string;
  private readonly _patientId: string;
  private readonly _packageName: string;
  private readonly _totalSessions: number;
  private readonly _purchaseDate: Date;
  private readonly _expiryDate: Date;
  private readonly _pricePaid: number;
  private _redemptions: SessionRedemptionRecord[] = [];
  private _isTerminated: boolean = false;

  constructor(
    id: string,
    patientId: string,
    packageName: string,
    totalSessions: number,
    purchaseDate: Date,
    expiryDate: Date,
    pricePaid: number
  ) {
    if (!id) throw new Error("Package ID is required.");
    if (!patientId) throw new Error("Patient ID is required.");
    if (totalSessions <= 0) throw new Error("Total sessions must be positive integer.");
    if (expiryDate <= purchaseDate) throw new Error("Expiry date must be after purchase date.");
    if (pricePaid < 0) throw new Error("Price paid cannot be negative.");

    this._id = id;
    this._patientId = patientId;
    this._packageName = packageName;
    this._totalSessions = totalSessions;
    this._purchaseDate = purchaseDate;
    this._expiryDate = expiryDate;
    this._pricePaid = pricePaid;
  }

  public get id(): string { return this._id; }
  public get patientId(): string { return this._patientId; }
  public get packageName(): string { return this._packageName; }
  public get totalSessions(): number { return this._totalSessions; }
  public get sessionsCompleted(): number { return this._redemptions.length; }
  public get sessionsRemaining(): number { return this._totalSessions - this._redemptions.length; }
  public get expiryDate(): Date { return new Date(this._expiryDate); }
  public get isExpired(): boolean { return Date.now() > this._expiryDate.getTime(); }
  public get redemptions(): ReadonlyArray<SessionRedemptionRecord> { return this._redemptions; }

  /**
   * Encapsulated Invariant: Redeem single session against package
   */
  public redeemSession(
    practitionerId: string,
    branchId: string,
    treatmentNotes: string,
    verifiedSignature: boolean = true
  ): SessionRedemptionRecord {
    if (this._isTerminated) {
      throw new Error("Cannot redeem session: Package has been voided or refunded.");
    }
    if (this.isExpired) {
      throw new Error("Cannot redeem session: Treatment package has expired.");
    }
    if (this.sessionsRemaining <= 0) {
      throw new Error("Cannot redeem session: All sessions have already been consumed.");
    }

    const sessionRecord: SessionRedemptionRecord = {
      redemptionId: `RED-${this._id}-${this.sessionsCompleted + 1}`,
      sessionNumber: this.sessionsCompleted + 1,
      redeemedAt: new Date(),
      practitionerId,
      roomOrBranchId: branchId,
      patientSignatureVerification: verifiedSignature,
      treatmentNotes,
    };

    this._redemptions.push(sessionRecord);
    return sessionRecord;
  }

  public extendExpiry(newExpiryDate: Date, authorizedManagerId: string): void {
    if (!authorizedManagerId) throw new Error("Manager authorization required to extend package expiry.");
    if (newExpiryDate <= this._expiryDate) throw new Error("New expiry date must extend beyond current expiry.");
    // In real system, emits PackageExpiryExtendedEvent for audit
  }
}
