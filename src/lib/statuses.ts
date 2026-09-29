export const LEAD_STATUSES = [
  "new",
  "to_contact",
  "contacted",
  "in_talks",
  "offer",
  "won",
  "lost",
  "rejected",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
