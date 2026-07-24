export type TicketStatus = "open" | "closed";
export type TicketKind = "technical" | "player-report" | "appeal" | "gameplay" | "admin";

export interface TicketRecord {
  id: number;
  openerId: string;
  channelId: string;
  status: TicketStatus;
  kind: TicketKind;
  claimedById?: string;
  createdAt: string;
  closedAt?: string;
}

export interface TicketsData {
  nextId: number;
  tickets: TicketRecord[];
}
