import { describe, expect, it, vi } from 'vitest';
import { CallChime, calledTickets, hasNewCall } from '../src/client/call-chime';
const ticket = (ticketNumber: string, roomName = 'Room 1', status = 'CALLED_TO_ROOM') => ({
  ticketNumber,
  roomName,
  status,
});
function fakeAudio() {
  const oscillators: any[] = [];
  const gains: any[] = [];
  const context = {
    state: 'suspended',
    currentTime: 10,
    destination: {},
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
    close: vi.fn(async () => {
      context.state = 'closed';
    }),
    createOscillator: vi.fn(() => {
      const node = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        frequency: { value: 0 },
        start: vi.fn(),
        stop: vi.fn(),
        onended: undefined as (() => void) | undefined,
      };
      oscillators.push(node);
      return node;
    }),
    createGain: vi.fn(() => {
      const node = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      };
      gains.push(node);
      return node;
    }),
  };
  return { context, oscillators, gains };
}
describe('waiting room call chime', () => {
  it('keeps initial/branch snapshots silent and announces the first call after an empty queue', () => {
    const call = calledTickets([ticket('Q-001')]);
    expect(hasNewCall(null, call)).toBe(false);
    expect(hasNewCall(calledTickets([]), call)).toBe(true);
    expect(hasNewCall(call, calledTickets([]))).toBe(false);
  });
  it('ignores reorder, removal and consultation status changes but announces new tickets or room changes', () => {
    const before = calledTickets([ticket('Q-001'), ticket('Q-002', 'Room 2')]);
    expect(
      hasNewCall(
        before,
        calledTickets([ticket('Q-002', 'Room 2'), ticket('Q-001', 'Room 1', 'IN_CONSULTATION')]),
      ),
    ).toBe(false);
    expect(hasNewCall(before, calledTickets([ticket('Q-002', 'Room 2')]))).toBe(false);
    expect(hasNewCall(before, calledTickets([ticket('Q-003')]))).toBe(true);
    expect(hasNewCall(before, calledTickets([ticket('Q-001', 'Room 3')]))).toBe(true);
    expect(calledTickets([ticket('Q-009', 'Room 1', 'REGISTERED')]).size).toBe(0);
  });
  it('resumes one persistent context during enable, plays a sample and schedules subsequent calls', async () => {
    const { context, oscillators, gains } = fakeAudio();
    const create = vi.fn(() => context as unknown as AudioContext);
    const chime = new CallChime(create);
    expect(await chime.enable()).toBe(true);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(oscillators).toHaveLength(1);
    chime.play();
    expect(create).toHaveBeenCalledOnce();
    expect(oscillators).toHaveLength(2);
    expect(oscillators[1].start).toHaveBeenCalledWith(10);
    expect(oscillators[1].stop).toHaveBeenCalledWith(10.7);
    expect(gains[1].gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.001, 10.7);
    oscillators[1].onended();
    expect(oscillators[1].disconnect).toHaveBeenCalledOnce();
    expect(gains[1].disconnect).toHaveBeenCalledOnce();
    chime.disable();
    expect(context.close).toHaveBeenCalledOnce();
    expect(() => chime.play()).toThrow('blocked');
  });
  it('surfaces blocked or unsupported audio without scheduling sound', async () => {
    const { context, oscillators } = fakeAudio();
    context.resume.mockImplementation(async () => {});
    const chime = new CallChime(() => context as unknown as AudioContext);
    await expect(chime.enable()).rejects.toThrow('blocked');
    expect(oscillators).toHaveLength(0);
    const unsupported = new CallChime(() => {
      throw new Error('Unsupported audio');
    });
    await expect(unsupported.enable()).rejects.toThrow('Unsupported audio');
  });
  it('does not play after disable while resume is pending', async () => {
    const { context, oscillators } = fakeAudio();
    let finish!: () => void;
    context.resume.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const chime = new CallChime(() => context as unknown as AudioContext);
    const enabled = chime.enable();
    chime.disable();
    finish();
    expect(await enabled).toBe(false);
    expect(oscillators).toHaveLength(0);
  });
});
