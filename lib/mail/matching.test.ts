import { describe, expect, it } from "vitest";
import { matchThread, type KnownContact, type MatchRule } from "./matching";

const noRules: MatchRule[] = [];
const noContacts: KnownContact[] = [];

describe("matchThread", () => {
  it("is unmatched with no rules and no known contacts", () => {
    const result = matchThread({ fromAddress: "x@nowhere.com", subject: "Hi" }, noRules, noContacts);
    expect(result).toEqual({ clientId: null, projectId: null, matchedBy: "unmatched" });
  });

  it("matches by an exact known contact address", () => {
    const contacts: KnownContact[] = [{ email: "lou@therealco.com", clientId: "c1" }];
    const result = matchThread({ fromAddress: "lou@therealco.com", subject: "Hi" }, noRules, contacts);
    expect(result).toEqual({ clientId: "c1", projectId: null, matchedBy: "address" });
  });

  it("matches by a known contact's domain when the address itself is new", () => {
    const contacts: KnownContact[] = [{ email: "lou@therealco.com", clientId: "c1" }];
    // Eliza is new, but shares Lou's domain — a very common real case
    // (someone new joins a client's team).
    const result = matchThread({ fromAddress: "eliza@therealco.com", subject: "Hi" }, noRules, contacts);
    expect(result).toEqual({ clientId: "c1", projectId: null, matchedBy: "domain" });
  });

  it("is case-insensitive on both the address and the domain", () => {
    const contacts: KnownContact[] = [{ email: "Lou@TheRealCo.com", clientId: "c1" }];
    const result = matchThread({ fromAddress: "LOU@therealco.COM", subject: "Hi" }, noRules, contacts);
    expect(result.matchedBy).toBe("address");
  });

  it("an address rule outranks a domain rule for the same thread", () => {
    const rules: MatchRule[] = [
      { kind: "email_domain", pattern: "therealco.com", clientId: "domain-guess", projectId: null },
      { kind: "address", pattern: "lou@therealco.com", clientId: "corrected", projectId: "p1" },
    ];
    const result = matchThread({ fromAddress: "lou@therealco.com", subject: "Hi" }, rules, noContacts);
    expect(result).toEqual({ clientId: "corrected", projectId: "p1", matchedBy: "address" });
  });

  it("an address rule outranks a contact-domain guess — the human correction wins", () => {
    // A contact exists on this domain suggesting client A, but a rule says
    // this specific address is actually client B. The rule must win: it
    // exists because someone corrected a real mismatch.
    const rules: MatchRule[] = [
      { kind: "address", pattern: "billing@sharedvendor.com", clientId: "client-b", projectId: null },
    ];
    const contacts: KnownContact[] = [{ email: "sales@sharedvendor.com", clientId: "client-a" }];
    const result = matchThread(
      { fromAddress: "billing@sharedvendor.com", subject: "Invoice" }, rules, contacts
    );
    expect(result.clientId).toBe("client-b");
  });

  it("a domain rule outranks a subject rule", () => {
    const rules: MatchRule[] = [
      { kind: "subject", pattern: "invoice", clientId: "from-subject", projectId: null },
      { kind: "email_domain", pattern: "therealco.com", clientId: "from-domain", projectId: null },
    ];
    const result = matchThread(
      { fromAddress: "new@therealco.com", subject: "Your invoice" }, rules, noContacts
    );
    expect(result.clientId).toBe("from-domain");
  });

  it("matches a subject rule as a substring, not requiring an exact subject", () => {
    const rules: MatchRule[] = [
      { kind: "subject", pattern: "medello", clientId: "c1", projectId: "p1" },
    ];
    const result = matchThread(
      { fromAddress: "unknown@somewhere.io", subject: "Re: Medello — homepage feedback" },
      rules, noContacts
    );
    expect(result).toEqual({ clientId: "c1", projectId: "p1", matchedBy: "subject" });
  });

  it("does not match a domain rule against a subject substring, or vice versa", () => {
    const rules: MatchRule[] = [
      { kind: "email_domain", pattern: "medello", clientId: "wrong", projectId: null },
    ];
    const result = matchThread(
      { fromAddress: "new@somewhere.io", subject: "About Medello" }, rules, noContacts
    );
    expect(result.matchedBy).toBe("unmatched");
  });
});
