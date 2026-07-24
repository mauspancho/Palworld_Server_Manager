export type SuggestionStatus = "En votacion" | "En revision" | "Aprobada" | "Rechazada" | "Implementada";
export type SuggestionVote = "up" | "down";

export interface SuggestionRecord {
  id: string;
  authorId: string;
  title: string;
  description: string;
  status: SuggestionStatus;
  votes: Record<string, SuggestionVote>;
}

export function applySuggestionVote(record: SuggestionRecord, userId: string, vote: SuggestionVote): void {
  record.votes[userId] = vote;
}

export function suggestionVoteCounts(record: SuggestionRecord): { up: number; down: number } {
  return Object.values(record.votes).reduce((counts, vote) => {
    counts[vote] += 1;
    return counts;
  }, { up: 0, down: 0 });
}

export function isValidSuggestionStatus(status: string): status is SuggestionStatus {
  return ["En votacion", "En revision", "Aprobada", "Rechazada", "Implementada"].includes(status);
}
