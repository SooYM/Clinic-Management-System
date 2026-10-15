import type { RegistrationReceipt } from '../shared/public-registration';

export function canStartNewRegistration(receipt: RegistrationReceipt) {
  return (
    receipt.status === 'REJECTED' ||
    receipt.status === 'EXPIRED' ||
    (receipt.status === 'ACCEPTED' &&
      (receipt.visitStatus === 'COMPLETED' || receipt.visitStatus === 'EXPIRED'))
  );
}

export function latestRegistrationReceipt(
  received?: RegistrationReceipt,
  submitted?: RegistrationReceipt,
) {
  return received && (!submitted || received.reference === submitted.reference)
    ? received
    : submitted;
}

export function registrationReceiptStatus(receipt: RegistrationReceipt) {
  if (receipt.status === 'PENDING')
    return {
      title: 'Awaiting reception confirmation',
      message:
        'Go to reception with your IC or passport. Staff must verify your identity before you join the active queue.',
    };
  if (receipt.status === 'REJECTED')
    return {
      title: 'Please speak with reception',
      message: 'Ask reception to help with your visit. This ticket cannot be called.',
    };
  if (receipt.status === 'EXPIRED')
    return {
      title: 'This ticket has expired',
      message: 'Ask reception to help with your visit. This ticket cannot be called.',
    };
  switch (receipt.visitStatus) {
    case 'REGISTERED':
    case 'TRIAGE_WAITING':
      return {
        title: 'Checked in — waiting to be called',
        message:
          'Your identity has been confirmed. Keep this ticket and watch the waiting-room display.',
      };
    case 'CALLED_TO_ROOM': {
      const room = receipt.roomName?.trim();
      return {
        title: room ? `Please proceed to ${room}` : 'You have been called',
        message: room
          ? 'Your practitioner is ready. Take your ticket to the room shown above.'
          : 'Check the waiting-room display or ask reception for your room.',
      };
    }
    case 'IN_CONSULTATION':
      return {
        title: 'Consultation in progress',
        message: receipt.roomName?.trim()
          ? `Your consultation is now in progress in ${receipt.roomName.trim()}.`
          : 'Your consultation is now in progress.',
      };
    case 'DISPENSARY_WAITING':
      return {
        title: 'Please proceed to dispensary',
        message: 'Take your ticket to the dispensary counter for your medicines.',
      };
    case 'PAYMENT_WAITING':
      return {
        title: 'Please proceed to payment',
        message: 'Take your ticket to the payment counter to complete checkout.',
      };
    case 'COMPLETED':
      return {
        title: 'Visit completed',
        message: 'Your visit is complete. Speak with reception if you need further help.',
      };
    case 'SKIPPED':
      return {
        title: 'Please speak with reception',
        message: 'Your call was skipped. Ask reception to help you continue your visit.',
      };
    case 'EXPIRED':
      return {
        title: 'This visit has expired',
        message: 'Ask reception to help you check in again. This visit cannot be called.',
      };
    default:
      return {
        title: 'Visit status unavailable',
        message:
          'Your registration was accepted, but the current visit status is unavailable. Check with reception.',
      };
  }
}

export default function RegistrationReceiptStatus({ receipt }: { receipt: RegistrationReceipt }) {
  const presentation = registrationReceiptStatus(receipt);
  return (
    <div aria-live="polite" aria-atomic="true">
      <h2
        className={
          receipt.status === 'ACCEPTED' && receipt.visitStatus === 'CALLED_TO_ROOM'
            ? 'registration-call'
            : undefined
        }
      >
        {presentation.title}
      </h2>
      <p>{presentation.message}</p>
    </div>
  );
}
