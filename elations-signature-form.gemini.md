```json
{
  "inspected_areas": [
    {
      "box_2d": [0, 0, 200, 1000],
      "label": "header",
      "description": "Contains the company logo and contact information for Elation Systems Customer Support."
    },
    {
      "box_2d": [200, 0, 500, 1000],
      "label": "section_a",
      "description": "Authorization section for a company officer."
    },
    {
      "box_2d": [500, 0, 880, 1000],
      "label": "section_b",
      "description": "Confirmation and warrant section for the authorized person."
    },
    {
      "box_2d": [880, 0, 1000, 1000],
      "label": "footer",
      "description": "Contains the company's mailing address and phone/fax numbers."
    }
  ],
  "findings": [
    {
      "area": "header",
      "observation": "Logo for 'DESERT SERVICES' with the tagline 'The Ultimate Construction Services'. Contact info: Elation Systems Customer Support Fax (925) 924-0387, Email: Support@elationsystems.com."
    },
    {
      "area": "section_a",
      "observation": "Completed by Mike Lanning, Owner of Desert Services, on 3-30-22. He authorizes Kendra Ash to sign and certify compliance documents within Elation Systems."
    },
    {
      "area": "section_b",
      "observation": "Completed by Kendra Ash, Controller, on 3-30-22. She confirms her authority to sign payroll and compliance documents for Desert Services and acknowledges the issuance of a digital certificate."
    },
    {
      "area": "footer",
      "observation": "Address: P.O. Box 14695 Scottsdale, AZ 85267. Phone: 480-513-8986, Fax: 480-657-2057."
    }
  ],
  "measurements": [
    {
      "item": "document_dimensions",
      "value": "1224x1584 pixels"
    }
  ],
  "compliance_status": {
    "section_a_completion": "pass",
    "section_b_completion": "pass",
    "signatures_present": "pass",
    "dates_present": "pass"
  }
}
```

# Document Extraction: Desert Services Authorization Form

## Header

**DESERT SERVICES**  
*The Ultimate Construction Services*

Elation Systems Customer Support Fax (925) 924-0387 [Support@elationsystems.com](mailto:Support@elationsystems.com)

---

## Section A

**(Note: If you are an officer of the company, you may proceed directly to Section B)**

**Date:** 3-30-22

Dear Sir:

I, **Mike Lanning**, the undersigned, am **Owner** of Desert Services. I hereby authorize **Kendra Ash** to sign and certify compliance documents within Elation Systems such as certified payroll reports based upon government regulations on behalf of Desert Services.

Regards,

**Signature:** [Signed: Mike Lanning]  
**Full Name:** Michael Lanning

---

## Section B

**(Note: Section A needs to be completed if the person in this section is not an officer of the respective company)**

**Date:** 3-30-22

Dear Sir:

I, **Kendra Ash**, the undersigned, am the **Controller**. I confirm and warrant that I have the authority to sign and certify the certified payroll reports, labor and compliance documents based on government regulations on behalf of **Desert Services**. I am also declaring that I have the authority to make the above representations on behalf of **Desert Services**.

In doing so, I understand that Elation Systems will issue me a digital certificate along with my digitized ink signature, which will ultimately enable secure communications and electronic signing.

Sincerely,

**Signature:** [Signed: Kendra Ash]  
**Full name:** Kendra Ash

---

## Footer

P.O. Box 14695 Scottsdale, AZ 85267  
PH: 480-513-8986 Fax: 480-657-2057
