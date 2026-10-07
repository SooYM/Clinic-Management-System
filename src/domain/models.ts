export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 422,
  ) {
    super(message);
  }
}

export class Money {
  constructor(public readonly cents: number) {
    if (!Number.isSafeInteger(cents) || cents < 0 || cents > 2_000_000_000)
      throw new DomainError(
        'INVALID_MONEY',
        'Amount must be integer cents within supported limits.',
      );
  }
  add(other: Money): Money {
    return new Money(this.cents + other.cents);
  }
  multiply(quantity: number): Money {
    if (!Number.isSafeInteger(quantity) || quantity < 1)
      throw new DomainError('INVALID_QUANTITY', 'Quantity must be positive integer.');
    return new Money(this.cents * quantity);
  }
}

export const queueStatuses = [
  'REGISTERED',
  'TRIAGE_WAITING',
  'CALLED_TO_ROOM',
  'IN_CONSULTATION',
  'DISPENSARY_WAITING',
  'PAYMENT_WAITING',
  'COMPLETED',
  'SKIPPED',
] as const;
export type QueueStatus = (typeof queueStatuses)[number];
const transitions: Record<QueueStatus, readonly QueueStatus[]> = {
  REGISTERED: ['TRIAGE_WAITING', 'SKIPPED'],
  TRIAGE_WAITING: ['CALLED_TO_ROOM', 'SKIPPED'],
  CALLED_TO_ROOM: ['IN_CONSULTATION', 'TRIAGE_WAITING'],
  IN_CONSULTATION: ['DISPENSARY_WAITING', 'PAYMENT_WAITING'],
  DISPENSARY_WAITING: ['PAYMENT_WAITING'],
  PAYMENT_WAITING: ['COMPLETED'],
  COMPLETED: [],
  SKIPPED: ['TRIAGE_WAITING'],
};
export class QueueTicket {
  constructor(public readonly status: QueueStatus) {}
  transition(next: QueueStatus): QueueStatus {
    if (!transitions[this.status].includes(next))
      throw new DomainError('INVALID_TRANSITION', `Cannot move ${this.status} to ${next}.`, 409);
    return next;
  }
}

export interface PrescribedItem {
  itemId: number;
  quantity: number;
  dosage: string;
  durationDays: number;
}
export class ClinicalEncounter {
  static assertAllergySafety(
    allergies: string[],
    items: { name: string; ingredient: string }[],
  ): void {
    const normalized = allergies.map((a) => a.trim().toLowerCase()).filter(Boolean);
    for (const item of items) {
      const terms = [item.name, ...item.ingredient.split(/[,;]/)].map((t) =>
        t.trim().toLowerCase(),
      );
      if (normalized.some((a) => terms.some((t) => t === a || (a.length >= 3 && t.includes(a))))) {
        throw new DomainError(
          'ALLERGY_CONFLICT',
          `Prescription blocked: ${item.name} conflicts with recorded allergies.`,
        );
      }
    }
  }
}

export class FefoAllocator {
  static allocate(
    batches: { id: number; quantity: number; expires_on: string }[],
    quantity: number,
    today: string,
  ) {
    if (!Number.isSafeInteger(quantity) || quantity < 1)
      throw new DomainError('INVALID_QUANTITY', 'Quantity must be positive integer.');
    let remaining = quantity;
    const allocations: { batchId: number; quantity: number }[] = [];
    for (const batch of [...batches].sort((a, b) => a.expires_on.localeCompare(b.expires_on))) {
      if (batch.expires_on <= today || batch.quantity <= 0) continue;
      const taken = Math.min(remaining, batch.quantity);
      if (taken) allocations.push({ batchId: batch.id, quantity: taken });
      remaining -= taken;
      if (!remaining) break;
    }
    if (remaining) throw new DomainError('INSUFFICIENT_STOCK', 'Insufficient unexpired stock.');
    return allocations;
  }
}

export interface CommissionPolicy {
  serviceBaseBps: number;
  serviceThresholdCents: number;
  serviceHighBps: number;
  productBps: number;
}
export const defaultCommissionPolicy: CommissionPolicy = {
  serviceBaseBps: 1000,
  serviceThresholdCents: 50000,
  serviceHighBps: 1500,
  productBps: 500,
};
/** Configurable branch policy. Applied rates snapshot into immutable ledger; later edits never rewrite earnings. */
export class CommissionCalculator {
  static calculate(
    baseCents: number,
    category: string,
    policy: CommissionPolicy = defaultCommissionPolicy,
  ) {
    new Money(baseCents);
    if (
      ![policy.serviceBaseBps, policy.serviceHighBps, policy.productBps].every(
        (rate) => Number.isSafeInteger(rate) && rate >= 0 && rate <= 10000,
      ) ||
      !Number.isSafeInteger(policy.serviceThresholdCents) ||
      policy.serviceThresholdCents < 0
    )
      throw new DomainError(
        'INVALID_COMMISSION_POLICY',
        'Commission rates or threshold are invalid.',
      );
    const rateBasisPoints =
      category === 'PRODUCT'
        ? policy.productBps
        : baseCents >= policy.serviceThresholdCents
          ? policy.serviceHighBps
          : policy.serviceBaseBps;
    return {
      baseCents,
      rateBasisPoints,
      amountCents: Math.round((baseCents * rateBasisPoints) / 10000),
      category,
    };
  }
}
