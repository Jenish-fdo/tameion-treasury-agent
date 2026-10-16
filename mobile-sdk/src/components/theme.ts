/** Minimal, overridable look. Meaning is always carried by text and a symbol, never by colour alone. */
export interface CredentiaTheme {
  text: string;
  mutedText: string;
  border: string;
  background: string;
  low: string;
  limited: string;
  stronger: string;
  unknown: string;
}

export const defaultTheme: CredentiaTheme = {
  text: '#101A2B', mutedText: '#334155', border: '#C8BFAF', background: '#FFFDF8',
  low: '#BE3D3D', limited: '#9A6700', stronger: '#147D5A', unknown: '#334155',
};
