export type RulesPromptStatus = "pending" | "accepted";

export interface RulesPromptRecord {
  guildId: string;
  userId: string;
  messageId: string;
  channelId: string;
  status: RulesPromptStatus;
  rejectCount: number;
  createdAt: string;
  acceptedAt?: string;
  updatedAt: string;
}

export interface RulesPanelRecord {
  guildId: string;
  channelId: string;
  messageId: string;
  updatedAt: string;
}

export interface RulesAcceptanceData {
  prompts: RulesPromptRecord[];
  panel?: RulesPanelRecord;
}

export interface RulesAcceptanceResult {
  addedMemberRole: boolean;
  removedPendingRole: boolean;
}
