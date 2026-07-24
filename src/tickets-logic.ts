import type { TicketRecord, TicketsData, TicketKind } from "./tickets-types.js";

export function emptyTicketsData(): TicketsData {
  return { nextId: 1, tickets: [] };
}

export function findOpenTicketForUser(data: TicketsData, userId: string): TicketRecord | undefined {
  return data.tickets.find((ticket) => ticket.openerId === userId && ticket.status === "open");
}

export function createTicketRecord(data: TicketsData, openerId: string, channelId: string, kind: TicketKind, now = new Date()): TicketRecord {
  if (findOpenTicketForUser(data, openerId)) {
    throw new Error("El usuario ya tiene un ticket abierto.");
  }
  const ticket: TicketRecord = {
    id: data.nextId,
    openerId,
    channelId,
    kind,
    status: "open",
    createdAt: now.toISOString()
  };
  data.nextId += 1;
  data.tickets.push(ticket);
  return ticket;
}

export function closeTicketRecord(ticket: TicketRecord, now = new Date()): void {
  ticket.status = "closed";
  ticket.closedAt = now.toISOString();
}

export function reopenTicketRecord(ticket: TicketRecord): void {
  ticket.status = "open";
  ticket.closedAt = undefined;
}

export function formatTicketChannelName(id: number, username: string, closed = false): string {
  const safeUser = username.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 24) || "usuario";
  return `${closed ? "cerrado" : "ticket"}-${String(id).padStart(4, "0")}-${safeUser}`;
}
