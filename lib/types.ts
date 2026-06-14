export type Company = string;
export type Role = string;

export interface SessionData {
  sessionId: string;
  resumeText: string;
  company: Company;
  role: Role;
  messages: ChatMessage[];
  createdAt: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface EvaluationResult {
  overallScore: number;
  technicalScore: number;
  communicationScore: number;
  strengths: string[];
  weaknesses: string[];
  resumeClaimsVerified: string[];
  resumeClaimsChallenged: string[];
  recommendation: "Strong Hire" | "Hire" | "Borderline" | "No Hire";
  detailedFeedback: string;
}
