import { describe, expect, it } from "bun:test";
import { validateDraft } from "./validate";

describe("validateDraft", () => {
  describe("passing drafts", () => {
    it("accepts a well-formed contract review email", () => {
      const html = `<div>Matt,</div>
<div><br></div>
<div>I reviewed the LOI and had a few comments/questions (see attached for markup).</div>
<div><br></div>
<div>Could you provide the schedule of values that you used to get to this $19,439 total?</div>
<div><br></div>
<div>Let me know if you need an updated quote.</div>`;

      const issues = validateDraft(html);
      const errors = issues.filter((i) => i.severity === "error");
      expect(errors).toHaveLength(0);
    });

    it("accepts a short follow-up", () => {
      const html = `<div>Frank, Cathie,</div>
<div><br></div>
<div>Any updates on this counter signature?</div>`;

      const issues = validateDraft(html);
      const errors = issues.filter((i) => i.severity === "error");
      expect(errors).toHaveLength(0);
    });

    it("accepts an email with properly formatted bullets", () => {
      const html = `<div>Jamie,</div>
<div><br></div>
<div>If you can, can you provide me with the following:</div>
<ul style="margin-top:0; margin-bottom:0">
  <li><div>NOI</div></li>
  <li><div>Civil/Erosion/Construction Plans</div></li>
  <li><div>SWPPP Plan</div></li>
</ul>
<div><br></div>
<div>Let me know if you have any questions.</div>`;

      const issues = validateDraft(html);
      const errors = issues.filter((i) => i.severity === "error");
      expect(errors).toHaveLength(0);
    });

    it("accepts a quick confirmation", () => {
      const html = `<div>Marc,</div>
<div><br></div>
<div>There you go!</div>`;

      const issues = validateDraft(html);
      const errors = issues.filter((i) => i.severity === "error");
      expect(errors).toHaveLength(0);
    });
  });

  describe("forbidden phrases", () => {
    it("catches 'hope this finds you well'", () => {
      const html = `<div>Matt,</div>
<div><br></div>
<div>Hope this finds you well. I reviewed the contract.</div>`;

      const issues = validateDraft(html);
      expect(issues.some((i) => i.rule === "forbidden-phrase")).toBe(true);
    });

    it("catches 'just wanted to reach out'", () => {
      const html = `<div>Todd,</div>
<div><br></div>
<div>Just wanted to reach out about the permit status.</div>`;

      const issues = validateDraft(html);
      expect(issues.some((i) => i.rule === "forbidden-phrase")).toBe(true);
    });

    it("catches 'at your earliest convenience'", () => {
      const html = `<div>Susan,</div>
<div><br></div>
<div>Please respond at your earliest convenience.</div>`;

      const issues = validateDraft(html);
      expect(issues.some((i) => i.rule === "forbidden-phrase")).toBe(true);
    });

    it("catches 'kindly'", () => {
      const html = `<div>Robert,</div>
<div><br></div>
<div>Kindly send over the signed contract.</div>`;

      const issues = validateDraft(html);
      expect(issues.some((i) => i.rule === "forbidden-phrase")).toBe(true);
    });
  });

  describe("wrong closing", () => {
    it("catches 'Thanks,' as closing", () => {
      const html = `<div>Todd,</div>
<div><br></div>
<div>Here is the updated scope.</div>
<div><br></div>
<div>Thanks,</div>`;

      const issues = validateDraft(html);
      expect(issues.some((i) => i.rule === "wrong-closing")).toBe(true);
    });

    it("catches 'Regards,' as closing", () => {
      const html = `<div>Matt,</div>
<div><br></div>
<div>See attached.</div>
<div><br></div>
<div>Regards,</div>`;

      const issues = validateDraft(html);
      expect(issues.some((i) => i.rule === "wrong-closing")).toBe(true);
    });
  });

  describe("forbidden HTML", () => {
    it("catches <p> tags", () => {
      const html = `<div>Matt,</div>
<p>I reviewed the contract.</p>`;

      const issues = validateDraft(html);
      expect(
        issues.some((i) => i.rule === "forbidden-html" && i.match === "<p> tag")
      ).toBe(true);
    });

    it("catches <strong> tags", () => {
      const html = `<div>Matt,</div>
<div><br></div>
<div>The total is <strong>$19,439</strong>.</div>`;

      const issues = validateDraft(html);
      expect(
        issues.some(
          (i) => i.rule === "forbidden-html" && i.match === "<strong> tag"
        )
      ).toBe(true);
    });

    it("catches <em> and <i> tags", () => {
      const html = `<div>Todd,</div>
<div><br></div>
<div>This is <em>important</em> and <i>urgent</i>.</div>`;

      const issues = validateDraft(html);
      const htmlIssues = issues.filter((i) => i.rule === "forbidden-html");
      expect(htmlIssues.length).toBeGreaterThanOrEqual(2);
    });

    it("catches <table> tags", () => {
      const html = `<div>Nicole,</div>
<div><br></div>
<table><tr><td>Item</td><td>Price</td></tr></table>`;

      const issues = validateDraft(html);
      expect(
        issues.some(
          (i) => i.rule === "forbidden-html" && i.match === "<table> tag"
        )
      ).toBe(true);
    });
  });

  describe("signature in body", () => {
    it("warns if signature content appears in draft", () => {
      const html = `<div>Marc,</div>
<div><br></div>
<div>There you go!</div>
<div><br></div>
<div>Best,</div>
<div>--</div>
<div><br></div>
<div>Chi Ejimofor</div>
<div>Project Coordinator</div>
<div>E: chi@desertservices.net</div>
<div>M: (304) 405-2446</div>`;

      const issues = validateDraft(html);
      expect(issues.some((i) => i.rule === "signature-in-body")).toBe(true);
    });
  });

  describe("HTML formatting", () => {
    it("warns on <ul> without margin reset", () => {
      const html = `<div>Jamie,</div>
<div><br></div>
<ul>
  <li><div>NOI</div></li>
  <li><div>Plans</div></li>
</ul>`;

      const issues = validateDraft(html);
      expect(issues.some((i) => i.rule === "ul-margin-reset")).toBe(true);
    });
  });

  describe("greeting format", () => {
    it("warns if greeting doesn't end with comma", () => {
      const html = `<div>Hello Matt</div>
<div><br></div>
<div>Here is the update.</div>`;

      const issues = validateDraft(html);
      expect(issues.some((i) => i.rule === "greeting-format")).toBe(true);
    });

    it("catches Dear opening", () => {
      const html = `<div>Dear Mr. Smith,</div>
<div><br></div>
<div>I reviewed the contract.</div>`;

      const issues = validateDraft(html);
      expect(issues.some((i) => i.rule === "no-dear")).toBe(true);
    });
  });

  describe("email length", () => {
    it("errors on emails exceeding 20 content lines", () => {
      const lines = Array.from(
        { length: 25 },
        (_, i) => `<div>Line ${i + 1} of content here.</div>`
      );
      const html = `<div>Matt,</div>
<div><br></div>
${lines.join("\n")}`;

      const issues = validateDraft(html);
      expect(issues.some((i) => i.rule === "too-long")).toBe(true);
    });

    it("warns on emails exceeding 12 content lines", () => {
      const lines = Array.from(
        { length: 15 },
        (_, i) => `<div>Line ${i + 1} of content here.</div>`
      );
      const html = `<div>Matt,</div>
<div><br></div>
${lines.join("\n")}`;

      const issues = validateDraft(html);
      expect(issues.some((i) => i.rule === "long-email")).toBe(true);
    });
  });
});
