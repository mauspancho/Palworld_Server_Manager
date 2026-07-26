export type BreedingSourceId = "GAMES_GG" | "VANDAL";
export type BreedingVerificationStatus = "SOURCE_MARKED_1_0" | "LEGACY_REQUIRES_1_0_VERIFICATION";
export type BreedingGender = "MALE" | "FEMALE" | null;
export type BreedingFilter = "all" | "verified" | "legacy";

export interface BreedingSourceMetadata {
  label: string;
  url: string;
  updatedAt: string;
  verificationStatus: BreedingVerificationStatus;
}

export interface BreedingParent {
  name: string;
  gender: BreedingGender;
}

export interface BreedingCombination {
  target: string;
  parent1: BreedingParent;
  parent2: BreedingParent;
  sources: BreedingSourceId[];
  verificationStatus: BreedingVerificationStatus;
  sourceUpdatedAt: string;
  sourceUpdatedAtBySource?: Partial<Record<BreedingSourceId, string>>;
}

export interface BreedingPalRecord {
  id: string;
  name: string;
  categories: string[];
  aliases: string[];
  combinations: BreedingCombination[];
}

export interface BreedingDataFile {
  schemaVersion: 1;
  sources: Record<BreedingSourceId, BreedingSourceMetadata>;
  pals: BreedingPalRecord[];
}

export interface BreedingCatalog {
  data: BreedingDataFile;
  pals: BreedingPalRecord[];
  byId: Map<string, BreedingPalRecord>;
  bySearchKey: Map<string, BreedingPalRecord>;
}

export interface BreedingQueryResult {
  pal: BreedingPalRecord;
  combinations: BreedingCombination[];
  filter: BreedingFilter;
}

export interface BreedingValidationSummary {
  palCount: number;
  combinationCount: number;
  gamesCombinationCount: number;
  vandalAdditionalCombinationCount: number;
}

export interface BreedingPanelState {
  guildId: string;
  channelId: string;
  messageId: string;
  updatedAt: string;
}
