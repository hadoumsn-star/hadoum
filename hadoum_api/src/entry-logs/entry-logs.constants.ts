// A presence with no explicit expected-departure time is flagged overdue
// once it exceeds this many hours on site.
export const VISITOR_LONG_PRESENCE_WARNING_HOURS = Number(
  process.env.VISITOR_LONG_PRESENCE_WARNING_HOURS ?? 8,
);

// Check-ins outside this window require supervisor validation
// (AFTER_HOURS_ACCESS).
export const REGISTER_BUSINESS_HOURS_START = Number(
  process.env.REGISTER_BUSINESS_HOURS_START ?? 7,
);
export const REGISTER_BUSINESS_HOURS_END = Number(
  process.env.REGISTER_BUSINESS_HOURS_END ?? 20,
);

// An expected visit still not checked in this many hours after its
// scheduled arrival is flagged as a no-show.
export const EXPECTED_VISIT_NO_SHOW_GRACE_HOURS = Number(
  process.env.EXPECTED_VISIT_NO_SHOW_GRACE_HOURS ?? 2,
);
