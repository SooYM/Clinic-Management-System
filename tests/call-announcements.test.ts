import { afterEach, describe, expect, it, vi } from 'vitest';
import { callAnnouncement, CallAnnouncements } from '../src/client/call-announcements';
function speech() {
  const speak = vi.fn();
  const cancel = vi.fn();
  const voice = { lang: 'en-GB', name: 'English' };
  vi.stubGlobal('speechSynthesis', { speak, cancel, getVoices: () => [voice] });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      constructor(readonly text: string) {}
    },
  );
  return { speak, cancel, voice };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('waiting room spoken announcements', () => {
  it('preserves leading ticket digits and speaks room name without patient fields', () => {
    expect(callAnnouncement('Q-001', 'Room 2')).toBe(
      'Ticket Q zero zero one, please proceed to Room 2.',
    );
    expect(callAnnouncement('Q-001', '2')).toBe(
      'Ticket Q zero zero one, please proceed to Room 2.',
    );
    expect(callAnnouncement('Q-001', 'Consultation Room 2')).toBe(
      'Ticket Q zero zero one, please proceed to Consultation Room 2.',
    );
    expect(callAnnouncement('Q-010', '')).toBe(
      'Ticket Q zero one zero, please proceed to your consultation room.',
    );
  });
  it('unlocks with a gesture sample and queues every new call after the chime using an English voice', () => {
    vi.useFakeTimers();
    const { speak, voice } = speech();
    const announcements = new CallAnnouncements(vi.fn());
    expect(announcements.enable()).toBe(true);
    expect(speak).toHaveBeenCalledOnce();
    expect(speak.mock.calls[0][0].voice).toBe(voice);
    announcements.announce([
      ['Q-001', 'Room 2'],
      ['Q-002', 'Room 3'],
    ]);
    announcements.announce([['Q-003', 'Room 1']]);
    vi.advanceTimersByTime(799);
    expect(speak).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    expect(speak.mock.calls.slice(1).map(([utterance]) => utterance.text)).toEqual([
      'Ticket Q zero zero one, please proceed to Room 2.',
      'Ticket Q zero zero two, please proceed to Room 3.',
      'Ticket Q zero zero three, please proceed to Room 1.',
    ]);
  });
  it('cancels speech and delayed calls on branch switches or disable, permitting re-enable', () => {
    vi.useFakeTimers();
    const { speak, cancel } = speech();
    const announcements = new CallAnnouncements(vi.fn());
    announcements.enable();
    announcements.announce([['Q-001', 'Room 2']]);
    announcements.cancelPending();
    vi.advanceTimersByTime(1000);
    expect(speak).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    announcements.announce([['Q-002', 'Room 1']]);
    announcements.disable();
    vi.advanceTimersByTime(1000);
    expect(speak).toHaveBeenCalledOnce();
    announcements.enable();
    expect(speak).toHaveBeenCalledTimes(2);
  });
  it('reports unsupported or failed speech while safely ignoring intentional cancellation', () => {
    vi.stubGlobal('speechSynthesis', undefined);
    const error = vi.fn();
    const unsupported = new CallAnnouncements(error);
    expect(unsupported.enable()).toBe(false);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('unavailable'));
    const { speak } = speech();
    const announcements = new CallAnnouncements(error);
    announcements.enable();
    const sample = speak.mock.calls[0][0];
    sample.onerror({ error: 'canceled' });
    expect(error).toHaveBeenCalledTimes(1);
    sample.onerror({ error: 'audio-busy' });
    expect(error).toHaveBeenCalledWith(expect.stringContaining('interrupted'));
    speak.mockImplementation(() => {
      throw new Error('Voice unavailable');
    });
    expect(announcements.enable()).toBe(false);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('could not start'));
  });
});
