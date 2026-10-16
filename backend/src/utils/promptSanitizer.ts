/**
 * Sanitisation for untrusted text that is shown to the AI models.
 *
 * Sanitising is hygiene, not a security boundary: no filter reliably stops prompt injection.
 * The real defences are structural (the text is JSON-encoded data in a separate message, the
 * output schema is strict, models must agree, and anything suspicious downgrades GO to REVIEW).
 */

// C0/C1 control characters except tab and newline (which are folded into spaces below).
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
// Zero-width characters, bidi overrides/isolates and BOM: used to hide or reorder text.
const INVISIBLE_CHARS = /[​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

/**
 * Normalises (NFKC, so look-alike/full-width forms collapse), strips control and invisible
 * characters, collapses whitespace and truncates.
 */
export function sanitizeText(input: string, maxLength = 2000): string {
  return input
    .normalize('NFKC')
    .replace(INVISIBLE_CHARS, '')
    .replace(CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

const INJECTION_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'override-instructions', re: /\b(ignore|disregard|forget|override)\b.{0,40}\b(instructions?|prompts?|rules?|guidelines?|above|previous|prior)\b/i },
  { name: 'system-prompt-reference', re: /\b(system|developer)\s+(prompt|message|instructions?)\b/i },
  { name: 'role-reassignment', re: /\byou\s+are\s+(now|no\s+longer)\b|\bact\s+as\b|\bpretend\s+(to\s+be|you)\b/i },
  { name: 'verdict-dictation', re: /\b(verdict|confidence)\b\s*["']?\s*[:=]|\b(respond|reply|answer|output|return)\b.{0,25}\b(GO|STOP)\b/i },
  { name: 'safety-bypass', re: /\b(jailbreak|do\s+anything\s+now|bypass\s+(the\s+)?(check|filter|review|safety))\b/i },
  { name: 'fake-markup', re: /<\/?(system|assistant|user|transaction|instructions?)\b|\[\/?(INST|SYSTEM)\]/i },
];

/**
 * Heuristic detector for text that tries to instruct the model. Returns the names of the
 * matching patterns (empty when nothing matched). Expect both false positives and misses.
 */
export function detectPromptInjection(text: string): string[] {
  return INJECTION_PATTERNS.filter(({ re }) => re.test(text)).map(({ name }) => name);
}
