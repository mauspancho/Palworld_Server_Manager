export function calculateRejectCount(currentRejectCount: number): number {
  return currentRejectCount + 1;
}

export function shouldShowAlreadyAccepted(hasMemberRole: boolean): boolean {
  return hasMemberRole;
}

export function canProcessRulesPrompt(promptUserId: string | undefined, interactionUserId: string): boolean {
  return promptUserId === interactionUserId;
}
