/**
 * OOP Domain Model: Patient Aggregate
 * Enforces Encapsulation, Invariant Validation, and Medical Safety Rules
 */

export interface Allergy {
  readonly allergen: string;
  readonly severity: "MILD" | "MODERATE" | "SEVERE" | "ANAPHYLACTIC";
  readonly dateIdentified: Date;
}

export class Patient {
  private readonly _id: string;
  private readonly _nationalId: string;
  private _fullName: string;
  private readonly _dateOfBirth: Date;
  private _allergies: Set<Allergy>;

  constructor(id: string, nationalId: string, fullName: string, dateOfBirth: Date) {
    if (!id || id.trim().length === 0) throw new Error("Patient ID cannot be empty.");
    if (!nationalId || nationalId.trim().length === 0) throw new Error("National ID cannot be empty.");
    if (!fullName || fullName.trim().length === 0) throw new Error("Full name cannot be empty.");
    if (dateOfBirth > new Date()) throw new Error("Date of birth cannot be in future.");

    this._id = id;
    this._nationalId = nationalId;
    this._fullName = fullName;
    this._dateOfBirth = dateOfBirth;
    this._allergies = new Set<Allergy>();
  }

  public get id(): string { return this._id; }
  public get nationalId(): string { return this._nationalId; }
  public get fullName(): string { return this._fullName; }
  public get dateOfBirth(): Date { return new Date(this._dateOfBirth); }

  public get age(): number {
    const ageDiffMs = Date.now() - this._dateOfBirth.getTime();
    const ageDate = new Date(ageDiffMs);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  }

  public get allergies(): ReadonlyArray<Allergy> {
    return Array.from(this._allergies);
  }

  public addAllergy(allergy: Allergy): void {
    const exists = Array.from(this._allergies).some(
      a => a.allergen.toLowerCase() === allergy.allergen.toLowerCase()
    );
    if (!exists) {
      this._allergies.add(allergy);
    }
  }

  public isAllergicTo(substance: string): boolean {
    const query = substance.trim().toLowerCase();
    return Array.from(this._allergies).some(
      a => query.includes(a.allergen.toLowerCase()) || a.allergen.toLowerCase().includes(query)
    );
  }
}
