// PR 18 §"Critical donation idempotency" — one fresh key per genuinely new
// donation-recording action, reused verbatim across retries of that same
// action. Callers get a new key by re-mounting the component that holds it
// (e.g. `key={...}` on the modal, or opening it fresh each time) — never by
// calling this again mid-submission.
export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}
