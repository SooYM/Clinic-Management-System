export interface Letterhead {
  logoDataUrl: string;
  header: string;
  address: string;
  footer: string;
}
export const emptyLetterhead: Letterhead = { logoDataUrl: '', header: '', address: '', footer: '' };
