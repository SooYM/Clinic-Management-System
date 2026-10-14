const spokenDigits = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
];
export function callAnnouncement(ticket: string, room: string): string {
  const spokenTicket = [...ticket]
    .map((character) =>
      /[0-9]/.test(character)
        ? spokenDigits[Number(character)]
        : /[A-Za-z]/.test(character)
          ? character
          : '',
    )
    .filter(Boolean)
    .join(' ');
  const spokenRoom = /^[0-9]+[A-Za-z]?$/.test(room.trim()) ? `Room ${room.trim()}` : room;
  return `Ticket ${spokenTicket}, please proceed to ${spokenRoom || 'your consultation room'}.`;
}
/** Browser speech contains ticket and room only. Native synthesis queues multiple utterances. */
export class CallAnnouncements {
  private enabled = false;
  private timer?: ReturnType<typeof setTimeout>;
  private pending: string[] = [];
  constructor(private readonly onError: (message: string) => void) {}
  enable(): boolean {
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
      this.onError(
        'Spoken announcements are unavailable in this browser. The call chime still works.',
      );
      return false;
    }
    this.enabled = true;
    this.speak('Announcements enabled. Ticket numbers and rooms will be announced.');
    return this.enabled;
  }
  announce(calls: readonly [string, string][]): void {
    if (!this.enabled || !calls.length) return;
    // Let the chime finish before speech. Preserve all calls arriving in one update.
    this.pending.push(...calls.map(([ticket, room]) => callAnnouncement(ticket, room)));
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const pending = this.pending;
      this.pending = [];
      if (this.enabled) for (const text of pending) this.speak(text);
    }, 800);
  }
  private speak(text: string): void {
    if (!this.enabled) return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-MY';
      const voice = speechSynthesis
        .getVoices()
        .find((voice) => voice.lang.toLowerCase().startsWith('en'));
      if (voice) utterance.voice = voice;
      utterance.onerror = (event) => {
        if (!this.enabled || ['canceled', 'interrupted'].includes(event.error)) return;
        this.disable();
        this.onError(
          'Spoken announcements were interrupted. Turn announcements off and on to retry. The call chime still works.',
        );
      };
      speechSynthesis.speak(utterance);
    } catch {
      this.disable();
      this.onError(
        'Spoken announcements could not start. Check browser voice support. The call chime still works.',
      );
    }
  }
  cancelPending(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = [];
    if (typeof speechSynthesis !== 'undefined') {
      try {
        speechSynthesis.cancel();
      } catch {
        /* Cleanup must not interrupt the visual display. */
      }
    }
  }
  disable(): void {
    this.enabled = false;
    this.cancelPending();
  }
}
