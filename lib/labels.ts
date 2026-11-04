export const CHOICE_LABEL = {
  AVAILABLE: "Available",
  NOT_AVAILABLE: "Not available",
  BACKUP: "Available, and willing to be a backup",
} as const;

export type ChoiceKey = keyof typeof CHOICE_LABEL;

export const STATUS_LABEL = {
  SCHEDULED: "Voting not open yet",
  OPEN: "Voting open",
  CLOSED: "Voting closed",
  ALLOCATED: "Allocation drafted",
  PUBLISHED: "Allocation published",
  COMPLETED: "Satsang held",
} as const;
