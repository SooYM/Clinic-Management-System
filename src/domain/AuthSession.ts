/**
 * OOP Domain Model: Authentication & Role-Based Access Control
 * Adheres to Single Responsibility & Dependency Inversion Principles
 */

export type ClinicRole = "doctor" | "receptionist" | "nurse" | "manager";

export interface UserAccount {
  readonly id: string;
  readonly username: string;
  readonly fullName: string;
  readonly role: ClinicRole;
  readonly licenseNumber?: string;
  readonly assignedBranch: string;
  readonly avatarInitials: string;
}

export interface AuthSession {
  readonly token: string;
  readonly user: UserAccount;
  readonly expiresAt: Date;
}
