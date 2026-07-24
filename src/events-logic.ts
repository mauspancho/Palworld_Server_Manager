export interface CommunityEventReminderState {
  eventId: string;
  sentReminderMinutes: number[];
}

export function validateFutureEventDate(date: Date, now = new Date()): void {
  if (date.getTime() <= now.getTime()) {
    throw new Error("No se pueden crear eventos con fechas pasadas.");
  }
}

export function dueReminderMinutes(eventDate: Date, now: Date, sent: number[]): number[] {
  const minutesUntil = Math.floor((eventDate.getTime() - now.getTime()) / 60000);
  return [1440, 60, 15].filter((minutes) => minutesUntil <= minutes && !sent.includes(minutes));
}
