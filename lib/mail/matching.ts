/**
 * Thread-to-client/project matching — the one algorithm meant to serve both
 * mail (this phase) and meetings (Granola, next phase), per the schema
 * comment on `match_rules` in 0001: "Resolve a triage item once, and the
 * match is remembered." This module only knows about email shapes, but the
 * matching PRINCIPLE (rules first, then domain, then remember what's
 * chosen) is the one to reuse rather than re-invent for meetings.
 */

export type MatchedBy = "domain" | "address" | "subject" | "manual" | "unmatched";

export interface MatchCandidate {
  fromAddress: string;
  subject: string;
}

export interface MatchRule {
  kind: "email_domain" | "address" | "subject";
  /** For email_domain/address: lower-cased. For subject: a substring match,
   * also lower-cased — deliberately not a regex, so a rule a non-technical
   * user "sets by resolving a triage item once" can't accidentally contain
   * regex metacharacters that behave unexpectedly. */
  pattern: string;
  clientId: string | null;
  projectId: string | null;
}

export interface KnownContact {
  email: string;
  clientId: string;
}

export interface MatchResult {
  clientId: string | null;
  projectId: string | null;
  matchedBy: MatchedBy;
}

function emailDomain(address: string): string {
  return address.toLowerCase().split("@")[1] ?? "";
}

/**
 * Resolution order, most specific first:
 *   1. An explicit rule on the exact address (the strongest signal — someone
 *      corrected a mismatch once and it should never be asked again).
 *   2. An explicit rule on the sender's domain.
 *   3. An explicit rule matching a substring of the subject.
 *   4. A known contact's email address, exactly.
 *   5. A known contact's email domain.
 *   Otherwise unmatched — surfaced in the triage queue, never guessed.
 *
 * A rule always outranks a contact-domain guess: a rule exists because a
 * human corrected something, which is stronger evidence than "this domain
 * happens to also appear in the contacts table."
 */
export function matchThread(
  candidate: MatchCandidate,
  rules: readonly MatchRule[],
  contacts: readonly KnownContact[]
): MatchResult {
  const fromAddress = candidate.fromAddress.toLowerCase();
  const domain = emailDomain(fromAddress);
  const subject = candidate.subject.toLowerCase();

  const addressRule = rules.find((r) => r.kind === "address" && r.pattern === fromAddress);
  if (addressRule) {
    return { clientId: addressRule.clientId, projectId: addressRule.projectId, matchedBy: "address" };
  }

  const domainRule = rules.find((r) => r.kind === "email_domain" && r.pattern === domain);
  if (domainRule) {
    return { clientId: domainRule.clientId, projectId: domainRule.projectId, matchedBy: "domain" };
  }

  const subjectRule = rules.find(
    (r) => r.kind === "subject" && r.pattern.length > 0 && subject.includes(r.pattern)
  );
  if (subjectRule) {
    return { clientId: subjectRule.clientId, projectId: subjectRule.projectId, matchedBy: "subject" };
  }

  const exactContact = contacts.find((c) => c.email.toLowerCase() === fromAddress);
  if (exactContact) {
    return { clientId: exactContact.clientId, projectId: null, matchedBy: "address" };
  }

  const domainContact = contacts.find((c) => emailDomain(c.email) === domain && domain !== "");
  if (domainContact) {
    return { clientId: domainContact.clientId, projectId: null, matchedBy: "domain" };
  }

  return { clientId: null, projectId: null, matchedBy: "unmatched" };
}
