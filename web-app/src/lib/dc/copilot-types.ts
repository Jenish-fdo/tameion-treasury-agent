/** Wire types shared by the copilot UI and /api/copilot. Everything here is plain, display-ready data. */

export interface CopilotVerification {
  status: string;
  detail: string;
  checks: { label: string; result: string; note: string }[];
}

export interface CopilotCredential {
  id: string;
  title: string | null;
  recipientName: string | null;
  description: string | null;
  issuer: string | null;
  holder: string | null;
  issued: string | null;
  expires: string | null;
  transaction: string | null;
  highAssurance: boolean;
  network: string;
}

export interface CopilotIssuer {
  address: string | null;
  cviStatus: string;
  cviDetail: string;
  /** null when no indexer or demo record is available. */
  record: { issued: number; revoked: number; verificationsRecorded: number; reputationScore: number } | null;
  recordSource: string;
}

export interface CopilotContext {
  verification: CopilotVerification;
  credential: CopilotCredential;
  issuer: CopilotIssuer;
  activity: { event: string; when: string; result?: string }[];
  verificationCount: number;
}

export type CopilotRequest =
  | { task: 'draft'; idea: string }
  | { task: 'ask'; question: string; context: CopilotContext }
  | { task: 'summarize'; context: CopilotContext };

export interface CopilotDraft {
  title: string;
  description: string;
  criteria: string[];
}

export type CopilotResponse = { text: string } | { draft: CopilotDraft } | { error: string };
