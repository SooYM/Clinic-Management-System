import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RegistrationReceipt } from '../src/shared/public-registration';
import RegistrationReceiptStatus, {
  canStartNewRegistration,
  latestRegistrationReceipt,
  registrationReceiptStatus,
} from '../src/client/RegistrationReceiptStatus';

const receipt: RegistrationReceipt = {
  reference: 'REG-123',
  ticketNumber: 'Q-001',
  branchName: 'Main Branch',
  status: 'ACCEPTED',
  expiresAt: '2026-10-20T16:00:00.000Z',
  visitStatus: 'REGISTERED',
  roomName: null,
};
describe('patient receipt visit guidance', () => {
  it.each([
    ['PENDING', null, false],
    ['REJECTED', null, true],
    ['EXPIRED', null, true],
    ['ACCEPTED', 'REGISTERED', false],
    ['ACCEPTED', 'TRIAGE_WAITING', false],
    ['ACCEPTED', 'CALLED_TO_ROOM', false],
    ['ACCEPTED', 'IN_CONSULTATION', false],
    ['ACCEPTED', 'DISPENSARY_WAITING', false],
    ['ACCEPTED', 'PAYMENT_WAITING', false],
    ['ACCEPTED', 'SKIPPED', false],
    ['ACCEPTED', null, false],
    ['ACCEPTED', 'COMPLETED', true],
    ['ACCEPTED', 'EXPIRED', true],
  ] as const)(
    'allows new registration for %s/%s only after the visit ends',
    (status, visitStatus, allowed) => {
      expect(canStartNewRegistration({ ...receipt, status, visitStatus })).toBe(allowed);
    },
  );
  it.each([
    ['REGISTERED', 'Checked in — waiting to be called'],
    ['TRIAGE_WAITING', 'Checked in — waiting to be called'],
    ['CALLED_TO_ROOM', 'Please proceed to Room 2'],
    ['IN_CONSULTATION', 'Consultation in progress'],
    ['DISPENSARY_WAITING', 'Please proceed to dispensary'],
    ['PAYMENT_WAITING', 'Please proceed to payment'],
    ['COMPLETED', 'Visit completed'],
    ['SKIPPED', 'Please speak with reception'],
    ['EXPIRED', 'This visit has expired'],
    [null, 'Visit status unavailable'],
  ] as const)('shows actual %s visit state', (visitStatus, title) => {
    const current = { ...receipt, visitStatus, roomName: 'Room 2' };
    expect(registrationReceiptStatus(current).title).toBe(title);
    const html = renderToStaticMarkup(
      createElement(RegistrationReceiptStatus, { receipt: current }),
    );
    expect(html).toContain(title);
    expect(html.includes('Room 2')).toBe(
      visitStatus === 'CALLED_TO_ROOM' || visitStatus === 'IN_CONSULTATION',
    );
  });

  it('explains missing room instead of inventing a room or claiming the patient is still waiting', () => {
    const presentation = registrationReceiptStatus({ ...receipt, visitStatus: 'CALLED_TO_ROOM' });
    expect(presentation.title).toBe('You have been called');
    expect(presentation.message).toContain('ask reception for your room');
  });

  it.each(['PENDING', 'REJECTED', 'EXPIRED'] as const)(
    'never exposes a stale room for %s registration',
    (status) => {
      const html = renderToStaticMarkup(
        createElement(RegistrationReceiptStatus, {
          receipt: { ...receipt, status, visitStatus: 'CALLED_TO_ROOM', roomName: 'Old Room' },
        }),
      );
      expect(html).not.toContain('Old Room');
      expect(html).not.toContain('waiting to be called');
    },
  );

  it('replaces the submitted waiting state with the latest same-ticket room call and later checkout', () => {
    const submitted = { ...receipt, status: 'PENDING' as const, visitStatus: null };
    const called = { ...receipt, visitStatus: 'CALLED_TO_ROOM' as const, roomName: 'Room 3' };
    const calledReceipt = latestRegistrationReceipt(called, submitted)!;
    expect(registrationReceiptStatus(calledReceipt).title).toBe('Please proceed to Room 3');
    const checkout = { ...called, visitStatus: 'PAYMENT_WAITING' as const };
    const checkoutReceipt = latestRegistrationReceipt(checkout, submitted)!;
    const html = renderToStaticMarkup(
      createElement(RegistrationReceiptStatus, { receipt: checkoutReceipt }),
    );
    expect(html).toContain('Please proceed to payment');
    expect(html).not.toContain('Room 3');
    expect(checkoutReceipt.ticketNumber).toBe(submitted.ticketNumber);
  });

  it('ignores the previous registration response while a new receipt loads', () => {
    const submitted = {
      ...receipt,
      reference: 'REG-NEW',
      status: 'PENDING' as const,
      visitStatus: null,
    };
    expect(latestRegistrationReceipt(receipt, submitted)).toBe(submitted);
    expect(latestRegistrationReceipt(undefined, submitted)).toBe(submitted);
    expect(latestRegistrationReceipt(receipt)).toBe(receipt);
  });
});
