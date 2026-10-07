import { describe, expect, it } from 'vitest';
import {
  Money,
  QueueTicket,
  ClinicalEncounter,
  FefoAllocator,
  CommissionCalculator,
} from '../src/domain/models';

describe('money invariants', () => {
  it.each([-1, 0.1, NaN, Infinity, 2_000_000_001])('rejects invalid amount %s', (amount) =>
    expect(() => new Money(amount)).toThrow(),
  );
  it('adds and multiplies exact minor units', () =>
    expect(new Money(125).add(new Money(75)).multiply(3).cents).toBe(600));
  it('rejects overflow', () => expect(() => new Money(2_000_000_000).add(new Money(1))).toThrow());
  it.each([0, -1, 0.5, NaN])('rejects invalid multiplication quantity %s', (quantity) =>
    expect(() => new Money(100).multiply(quantity)).toThrow(),
  );
});
describe('queue lifecycle', () => {
  it('allows complete clinic workflow', () => {
    const states = [
      'REGISTERED',
      'TRIAGE_WAITING',
      'CALLED_TO_ROOM',
      'IN_CONSULTATION',
      'DISPENSARY_WAITING',
      'PAYMENT_WAITING',
      'COMPLETED',
    ] as const;
    for (let i = 0; i < states.length - 1; i++)
      expect(new QueueTicket(states[i]).transition(states[i + 1])).toBe(states[i + 1]);
  });
  it('rejects bypassing clinical workflow', () =>
    expect(() => new QueueTicket('REGISTERED').transition('COMPLETED')).toThrow());
  it('allows restoring a skipped ticket', () =>
    expect(new QueueTicket('SKIPPED').transition('TRIAGE_WAITING')).toBe('TRIAGE_WAITING'));
  it('keeps completed tickets terminal', () =>
    expect(() => new QueueTicket('COMPLETED').transition('REGISTERED')).toThrow());
});
describe('allergy shield', () => {
  it('blocks normalized ingredient match', () =>
    expect(() =>
      ClinicalEncounter.assertAllergySafety(
        ['  PENICILLIN '],
        [{ name: 'Antibiotic', ingredient: 'Amoxicillin; penicillin' }],
      ),
    ).toThrow());
  it('blocks known ingredient substring', () =>
    expect(() =>
      ClinicalEncounter.assertAllergySafety(
        ['penicillin'],
        [{ name: 'Penicillin V', ingredient: 'Phenoxymethylpenicillin' }],
      ),
    ).toThrow());
  it('allows unrelated medication and blank allergy entries', () =>
    expect(() =>
      ClinicalEncounter.assertAllergySafety(
        [' ', 'penicillin'],
        [{ name: 'Paracetamol', ingredient: 'paracetamol' }],
      ),
    ).not.toThrow());
});
describe('first expiry first out', () => {
  const batches = [
    { id: 3, quantity: 8, expires_on: '2030-05-01' },
    { id: 2, quantity: 100, expires_on: '2026-01-01' },
    { id: 1, quantity: 3, expires_on: '2030-01-01' },
  ];
  it('splits allocations in expiry order and excludes expired stock', () =>
    expect(FefoAllocator.allocate(batches, 5, '2026-10-07')).toEqual([
      { batchId: 1, quantity: 3 },
      { batchId: 3, quantity: 2 },
    ]));
  it('does not mutate caller stock snapshots', () => {
    FefoAllocator.allocate(batches, 5, '2026-10-07');
    expect(batches[2].quantity).toBe(3);
  });
  it('rejects insufficient usable stock', () =>
    expect(() => FefoAllocator.allocate(batches, 12, '2026-10-07')).toThrow());
  it('excludes batches expiring today', () =>
    expect(() =>
      FefoAllocator.allocate([{ id: 4, quantity: 5, expires_on: '2026-10-07' }], 1, '2026-10-07'),
    ).toThrow());
  it.each([0, -1, 0.5, NaN])('rejects invalid dispense quantity %s', (quantity) =>
    expect(() => FefoAllocator.allocate(batches, quantity, '2026-10-07')).toThrow(),
  );
});
describe('commission policy', () => {
  it('uses retail five percent', () =>
    expect(CommissionCalculator.calculate(10000, 'PRODUCT').amountCents).toBe(500));
  it('changes service rate at declared threshold', () => {
    expect(CommissionCalculator.calculate(49999, 'SERVICE').rateBasisPoints).toBe(1000);
    expect(CommissionCalculator.calculate(50000, 'SERVICE').rateBasisPoints).toBe(1500);
  });
  it('rounds once to integer minor units', () =>
    expect(CommissionCalculator.calculate(101, 'PRODUCT').amountCents).toBe(5));
});
