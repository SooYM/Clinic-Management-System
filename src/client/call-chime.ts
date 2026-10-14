export interface CallTicket {
  ticketNumber: string;
  roomName?: string | null;
  status: string;
}
export function calledTickets(tickets: readonly CallTicket[]): Map<string, string> {
  return new Map(
    tickets
      .filter((ticket) => ['CALLED_TO_ROOM', 'IN_CONSULTATION'].includes(ticket.status))
      .map((ticket) => [ticket.ticketNumber, ticket.roomName || '']),
  );
}
/** Initial/branch snapshots are silent; arrivals and changed rooms announce one update. */
export function hasNewCall(
  previous: ReadonlyMap<string, string> | null,
  next: ReadonlyMap<string, string>,
): boolean {
  return (
    previous !== null &&
    [...next].some(([ticket, room]) => !previous.has(ticket) || previous.get(ticket) !== room)
  );
}
/** Create and resume inside the user's click, then reuse this context for polling updates. */
export class CallChime {
  private context?: AudioContext;
  constructor(private readonly createContext: () => AudioContext = () => new AudioContext()) {}
  async enable(): Promise<boolean> {
    const context = (this.context ||= this.createContext());
    await context.resume();
    if (this.context !== context) return false;
    this.play();
    return true;
  }
  play(): void {
    const context = this.context;
    if (!context || context.state !== 'running')
      throw new Error('Call sound is blocked. Enable the chime again.');
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.7);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + 0.7);
  }
  disable(): void {
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }
}
