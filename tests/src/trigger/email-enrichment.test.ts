/**
 * Unit tests for email enrichment pure functions.
 * No DB, no network — just regex and string logic.
 */
import { describe, expect, test } from "bun:test";
import {
  computeDomainEnrichment,
  extractDomain,
  extractRealSender,
} from "@/src/trigger/email-enrichment";

// ── extractDomain ───────────────────────────────────────────────

describe("extractDomain", () => {
  test("extracts domain from email", () => {
    expect(extractDomain("joe@turner.com")).toBe("turner.com");
  });

  test("lowercases domain", () => {
    expect(extractDomain("Joe@Turner.COM")).toBe("turner.com");
  });

  test("returns null for null input", () => {
    expect(extractDomain(null)).toBeNull();
  });

  test("returns null for email without @", () => {
    expect(extractDomain("invalid")).toBeNull();
  });
});

// ── computeDomainEnrichment ─────────────────────────────────────

describe("computeDomainEnrichment", () => {
  test("basic external email", () => {
    const result = computeDomainEnrichment(
      "joe@turner.com",
      "Bid Invitation",
      null,
      null
    );
    expect(result.fromDomain).toBe("turner.com");
    expect(result.isInternal).toBe(false);
    expect(result.isForwarded).toBe(false);
    expect(result.originalSenderEmail).toBeNull();
  });

  test("internal email flagged", () => {
    const result = computeDomainEnrichment(
      "chi@desertservices.net",
      "Re: Project Update",
      null,
      null
    );
    expect(result.isInternal).toBe(true);
    expect(result.fromDomain).toBe("desertservices.net");
  });

  test("internal upwindcompanies flagged", () => {
    const result = computeDomainEnrichment(
      "rick@upwindcompanies.com",
      "FYI",
      null,
      null
    );
    expect(result.isInternal).toBe(true);
  });

  test("forwarded email detected by Fw: prefix", () => {
    const result = computeDomainEnrichment(
      "chi@desertservices.net",
      "Fw: Bid from Turner",
      "From: joe@turner.com\nSent: Monday...",
      null
    );
    expect(result.isForwarded).toBe(true);
    expect(result.originalSenderEmail).toBe("joe@turner.com");
    expect(result.originalSenderDomain).toBe("turner.com");
  });

  test("forwarded email detected by FWD: prefix", () => {
    const result = computeDomainEnrichment(
      "kendra@desertservices.net",
      "FWD: Quote Request",
      null,
      "---------- Forwarded message ----------\nFrom: bob@sunbelt.com\nDate: Tue..."
    );
    expect(result.isForwarded).toBe(true);
    expect(result.originalSenderEmail).toBe("bob@sunbelt.com");
    expect(result.originalSenderDomain).toBe("sunbelt.com");
  });

  test("non-forwarded email ignores body From: lines", () => {
    const result = computeDomainEnrichment(
      "joe@turner.com",
      "Re: Project Status",
      "From: someone@else.com\nSent: ...",
      null
    );
    expect(result.isForwarded).toBe(false);
    expect(result.originalSenderEmail).toBeNull();
  });

  test("forwarded with no original sender found", () => {
    const result = computeDomainEnrichment(
      "chi@desertservices.net",
      "Fw: Something",
      "No sender info here",
      null
    );
    expect(result.isForwarded).toBe(true);
    expect(result.originalSenderEmail).toBeNull();
  });

  test("null fromEmail", () => {
    const result = computeDomainEnrichment(null, null, null, null);
    expect(result.fromDomain).toBeNull();
    expect(result.isInternal).toBe(false);
    expect(result.isForwarded).toBe(false);
  });
});

// ── extractRealSender ───────────────────────────────────────────
// Signature: (domain, fromName, body, subject)

describe("extractRealSender", () => {
  test("returns null for non-platform domain", () => {
    expect(extractRealSender("turner.com", "Joe", "body", "subj")).toBeNull();
  });

  test("returns null for null domain", () => {
    expect(extractRealSender(null, null, null, null)).toBeNull();
  });

  // ── BuildingConnected ──

  describe("BuildingConnected", () => {
    test("extracts sender from 'X of Y sent your company'", () => {
      const result = extractRealSender(
        "buildingconnected.com",
        "BuildingConnected",
        "John Smith of Turner Construction sent your company an invitation",
        "New invitation"
      );
      expect(result).not.toBeNull();
      expect(result?.platformName).toBe("BuildingConnected");
      expect(result?.realSenderName).toBe("John Smith");
      expect(result?.realSenderCompany).toBe("Turner Construction");
    });

    test("extracts sender from 'X from Y has invited'", () => {
      const result = extractRealSender(
        "buildingconnected.com",
        "BuildingConnected",
        "Jane Doe from Hensel Phelps has invited you to bid on Project X",
        "Bid Invitation"
      );
      expect(result?.realSenderName).toBe("Jane Doe");
      expect(result?.realSenderCompany).toBe("Hensel Phelps");
    });

    test("extracts from subject 'New message from X'", () => {
      const result = extractRealSender(
        "buildingconnected.com",
        "BuildingConnected",
        "No useful body",
        "New message from McCarthy Building"
      );
      expect(result?.realSenderCompany).toBe("McCarthy Building");
    });

    test("excludes 'Bid delivered:' subject", () => {
      const result = extractRealSender(
        "buildingconnected.com",
        "BuildingConnected",
        "body",
        "Bid delivered: Some Project"
      );
      expect(result).toBeNull();
    });

    test("excludes 'Welcome to' subject", () => {
      const result = extractRealSender(
        "buildingconnected.com",
        "BuildingConnected",
        "body",
        "Welcome to BuildingConnected"
      );
      expect(result).toBeNull();
    });

    test("extracts email from body", () => {
      const result = extractRealSender(
        "buildingconnected.com",
        "BuildingConnected",
        "John Smith of Turner Construction sent your company\nContact: john.smith@turner.com",
        "New invitation"
      );
      expect(result?.realSenderEmail).toBe("john.smith@turner.com");
      expect(result?.realSenderDomain).toBe("turner.com");
    });

    test("skips platform emails in body", () => {
      const result = extractRealSender(
        "buildingconnected.com",
        "BuildingConnected",
        "John Smith of Turner Construction sent your company\nnoreply@buildingconnected.com",
        "New invitation"
      );
      expect(result?.realSenderEmail).toBeNull();
      expect(result?.realSenderCompany).toBe("Turner Construction");
    });
  });

  // ── DocuSign ──

  describe("DocuSign", () => {
    test("extracts name from 'X via Docusign' display name", () => {
      const result = extractRealSender(
        "docusign.net",
        "Mike Johnson via Docusign",
        "body text",
        "Please sign: Contract"
      );
      expect(result?.platformName).toBe("DocuSign");
      expect(result?.realSenderCompany).toBe("Mike Johnson");
    });

    test("also works with docusign.com", () => {
      const result = extractRealSender(
        "docusign.com",
        "Sarah Lee via Docusign",
        "body",
        "Complete signing"
      );
      expect(result?.platformName).toBe("DocuSign");
      expect(result?.realSenderCompany).toBe("Sarah Lee");
    });
  });

  // ── Procore ──

  describe("Procore", () => {
    test("extracts from body 'X has invited you'", () => {
      const result = extractRealSender(
        "procoretech.com",
        "Procore",
        "Hi Chi, Sundt Construction. has invited you to collaborate on their project",
        "Project Invitation"
      );
      expect(result?.platformName).toBe("Procore");
      expect(result?.realSenderCompany).toBe("Sundt Construction");
    });

    test("works with us02 subdomain", () => {
      const result = extractRealSender(
        "us02.procoretech.com",
        "Procore",
        "Hi Team, Layton Construction. has invited you to collaborate",
        "Invitation"
      );
      expect(result?.realSenderCompany).toBe("Layton Construction");
    });
  });

  // ── BlueBook ──

  describe("BlueBook", () => {
    test("extracts from 'X has invited you to bid'", () => {
      const result = extractRealSender(
        "bbbid.thebluebook.com",
        "The Blue Book",
        "Mortenson Construction has invited you to bid on Highway Expansion",
        "Bid Invitation"
      );
      expect(result?.platformName).toBe("BlueBook");
      expect(result?.realSenderCompany).toBe("Mortenson Construction");
    });

    test("excludes BidScope Summary subject", () => {
      const result = extractRealSender(
        "bbbid.thebluebook.com",
        "The Blue Book",
        "body",
        "BidScope Summary"
      );
      expect(result).toBeNull();
    });
  });

  // ── PlanHub ──

  describe("PlanHub", () => {
    test("extracts from subject 'X has invited you to bid'", () => {
      const result = extractRealSender(
        "planhub.com",
        "PlanHub",
        "no useful body",
        "DPR Construction has invited you to bid"
      );
      expect(result?.platformName).toBe("PlanHub");
      expect(result?.realSenderCompany).toBe("DPR Construction");
    });

    test("works with message.planhub.com", () => {
      const result = extractRealSender(
        "message.planhub.com",
        "PlanHub",
        "no body",
        "Kiewit has invited you to bid on I-10 Widening"
      );
      expect(result?.realSenderCompany).toBe("Kiewit");
    });

    test("excludes PlanHub Subcontractor subjects", () => {
      const result = extractRealSender(
        "planhub.com",
        "PlanHub",
        "body",
        "PlanHub - Subcontractor Dashboard"
      );
      expect(result).toBeNull();
    });
  });

  // ── SmartBidNet ──

  describe("SmartBidNet", () => {
    test("returns null (no patterns, no signal)", () => {
      const result = extractRealSender(
        "smartbidnet.com",
        "SmartBidNet",
        "no extractable info",
        "Bid Notice"
      );
      expect(result).toBeNull();
    });

    test("extracts email from body if present", () => {
      const result = extractRealSender(
        "smartbidnet.com",
        "SmartBidNet",
        "Contact person: jim@suntecconcrete.com for details",
        "Bid Notice"
      );
      expect(result?.platformName).toBe("SmartBidNet");
      expect(result?.realSenderEmail).toBe("jim@suntecconcrete.com");
    });
  });

  // ── Pype ──

  describe("Pype", () => {
    test("extracts from 'X has chosen to use Pype Closeout'", () => {
      const result = extractRealSender(
        "pype.io",
        "Pype",
        "Holder Construction LLC has chosen to use Pype Closeout for the project",
        "Pype Closeout"
      );
      expect(result?.platformName).toBe("Pype");
      expect(result?.realSenderCompany).toBe("Holder Construction LLC");
    });
  });

  // ── BidMail ──

  describe("BidMail", () => {
    test("extracts company (companyFirst) from body", () => {
      const result = extractRealSender(
        "bidmail.com",
        "BidMail",
        "FromRyan Companies Inc.John Adams (jadams@ryan.com) has sent you a bid",
        "Ryan Companies Inc.: Project Bid"
      );
      expect(result?.platformName).toBe("BidMail");
      expect(result?.realSenderCompany).toBe("Ryan Companies Inc.");
    });

    test("extracts from subject pattern", () => {
      const result = extractRealSender(
        "bidmail.com",
        "BidMail",
        "no useful body patterns",
        "Weis Builders: New Bid Opportunity"
      );
      expect(result?.realSenderCompany).toBe("Weis Builders");
    });
  });

  // ── Edge cases ──

  describe("edge cases", () => {
    test("case-insensitive domain lookup", () => {
      const result = extractRealSender(
        "BuildingConnected.com",
        "BC",
        "John of Acme Corp sent your company a message",
        "New message"
      );
      expect(result?.platformName).toBe("BuildingConnected");
    });

    test("body with multiple non-platform emails picks first", () => {
      const result = extractRealSender(
        "buildingconnected.com",
        "BC",
        "Jane of ABC Corp sent your company\nContact: jane@abc.com or info@abc.com",
        "Invitation"
      );
      expect(result?.realSenderEmail).toBe("jane@abc.com");
    });
  });
});
