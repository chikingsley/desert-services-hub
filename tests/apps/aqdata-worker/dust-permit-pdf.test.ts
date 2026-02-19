import { describe, expect, test } from "bun:test";
import { parseDustPermitPdfText } from "../../../apps/aqdata-worker/src/aqdata/parsers/dust-permit-pdf";

const SAMPLE_PERMIT_TEXT = `
Dust Control Permit
ATTENTION: Fulton Homes Corporation

PROJECT INFORMATION:
Project Acreage: 100.74
Project Name: Acclaim
Project Type: Residential
Project Start Date: 05/01/2021

FACILITY ID:
ISSUE DATE:
EXPIRATION DATE:

F040387
02/20/2025
02/21/2026

SITE INFORMATION
Site Address 1: 33.48498/-112.27985
Parcel #: 102-25-916

Dust Control Application D0056656
Application Status: Active
Submitted Date: 02/14/2025
Block Permit: No

Provide an email address where we smaltz2@fultonhomes.com
can send the permit:
Name: Sue Maltz
Phone: (480) 753-7577

Permit Application Form, Part A: Applicant Information
Applicant
Relationship to property (Check all that apply): Property Owner
Type of Entity: Corporation
Name of company or individual Fulton
working as an individual:
Homes Corporation
Address 1: 9140 S Kyrene Rd
Address 2: Suite 202
City: Tempe
State: Arizona
Zip: 85282
Phone: 4807536789
E-Mail Address:
Applicant President/Owner

Primary Project Contact
Provide a primary project contact/authorized on-site representative for this site.
First Name: Tammie
Last Name: Borgardt
Title: Land Planning & Development Manager
E-Mail Address: tborgardt@fultonhomes.com
Company Name: Fulton Homes
On-Site Phone: (602) 694-3247
Mobile: (602) 694-3247
Fax: (480) 757-7577
Dust Control Coordinator

Permit Application Form, Part B: Project Information
Name of Project: Acclaim
Brief Project Description: Residential Development
Estimated Project Start Date 05/01/2021
Estimated Project Completion Date 05/01/2027
Project Location
`;

describe("dust permit pdf deterministic parser", () => {
  test("extracts core permit fields from normalized PDF text", () => {
    const parsed = parseDustPermitPdfText(SAMPLE_PERMIT_TEXT);

    expect(parsed.facilityId).toBe("F040387");
    expect(parsed.issueDate).toBe("02/20/2025");
    expect(parsed.expirationDate).toBe("02/21/2026");

    expect(parsed.applicationStatus).toBe("Active");
    expect(parsed.submittedDate).toBe("02/14/2025");
    expect(parsed.blockPermit).toBe("No");

    expect(parsed.project.name).toBe("Acclaim");
    expect(parsed.project.startDate).toBe("05/01/2021");
    expect(parsed.project.completionDate).toBe("05/01/2027");
    expect(parsed.project.description).toBe("Residential Development");

    expect(parsed.coordinates).toEqual({
      latitude: 33.484_98,
      longitude: -112.279_85,
    });
    expect(parsed.parcel).toBe("102-25-916");

    expect(parsed.permitContactEmail).toBe("smaltz2@fultonhomes.com");
    expect(parsed.primaryContact.email).toBe("tborgardt@fultonhomes.com");
    expect(parsed.primaryContact.firstName).toBe("Tammie");
    expect(parsed.primaryContact.lastName).toBe("Borgardt");

    expect(parsed.applicant.companyName).toBe("Fulton Homes Corporation");
    expect(parsed.applicant.entityType).toBe("Corporation");
    expect(parsed.applicant.address1).toBe("9140 S Kyrene Rd");
    expect(parsed.applicant.city).toBe("Tempe");
    expect(parsed.applicant.state).toBe("Arizona");
    expect(parsed.applicant.zip).toBe("85282");
  });
});
