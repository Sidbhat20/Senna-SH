// UPI straight to the organiser: a deep link any UPI app (GPay, PhonePe, Paytm, BHIM) opens with the details filled in.

/** "name@bank": same shape the database enforces on events.upi_id. */
export const validUpiId = (id: string) => /^[A-Za-z0-9._-]{2,255}@[A-Za-z]{2,64}$/.test(id.trim());

/** Short reference shown in the organiser's bank app, so they can match the payment to the entry. */
export const payRef = (entryId: string) => `SH${entryId.replace(/-/g, "").slice(0, 8).toUpperCase()}`; // no spaces: easy to type, valid as tr

/** tr is the transaction reference NPCI requires on dynamic links: at most 35 characters, no spaces. tn is a readable note. */
export function upiLink(p: { upiId: string; payee: string; rupees: number; ref: string; note: string }) {
  const tr = p.ref.replace(/\s+/g, "").slice(0, 35);
  const q = new URLSearchParams({ pa: p.upiId.trim(), pn: p.payee.slice(0, 50), tr, am: p.rupees.toFixed(2), cu: "INR", tn: p.note.slice(0, 50) });
  return `upi://pay?${q.toString().replace(/\+/g, "%20")}`;
}
