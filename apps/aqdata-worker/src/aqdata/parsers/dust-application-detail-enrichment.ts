import type { DustApplicationDetail } from "./dust-application-detail";
import type { DustPermitPdfExtraction } from "./dust-permit-pdf-types";

export function mergePermitPdfIntoDetail(
  detail: DustApplicationDetail,
  permitPdf: DustPermitPdfExtraction
): DustApplicationDetail {
  const merged: DustApplicationDetail = {
    ...detail,
    detailFields: { ...detail.detailFields },
    permitPdf,
    structured: {
      ...detail.structured,
      applicantCompany: { ...detail.structured.applicantCompany },
      contact: { ...detail.structured.contact },
      primaryContact: { ...detail.structured.primaryContact },
      project: { ...detail.structured.project },
    },
  };

  const pdf = permitPdf.fields;

  mergeFromPdf(merged.structured.contact, "email", pdf.permitContactEmail);
  mergeFromPdf(merged.structured.contact, "name", pdf.permitContactName);
  mergeFromPdf(merged.structured.contact, "phone", pdf.permitContactPhone);

  mergeFromPdf(
    merged.structured.primaryContact,
    "firstName",
    pdf.primaryContact.firstName
  );
  mergeFromPdf(
    merged.structured.primaryContact,
    "lastName",
    pdf.primaryContact.lastName
  );
  mergeFromPdf(
    merged.structured.primaryContact,
    "title",
    pdf.primaryContact.title
  );
  mergeFromPdf(
    merged.structured.primaryContact,
    "email",
    pdf.primaryContact.email
  );
  mergeFromPdf(
    merged.structured.primaryContact,
    "companyName",
    pdf.primaryContact.companyName
  );
  mergeFromPdf(
    merged.structured.primaryContact,
    "onSitePhone",
    pdf.primaryContact.onSitePhone
  );
  mergeFromPdf(
    merged.structured.primaryContact,
    "mobile",
    pdf.primaryContact.mobile
  );
  mergeFromPdf(merged.structured.primaryContact, "fax", pdf.primaryContact.fax);

  mergeFromPdf(
    merged.structured.applicantCompany,
    "companyName",
    pdf.applicant.companyName
  );
  mergeFromPdf(
    merged.structured.applicantCompany,
    "entityType",
    pdf.applicant.entityType
  );
  mergeFromPdf(
    merged.structured.applicantCompany,
    "address1",
    pdf.applicant.address1
  );
  mergeFromPdf(
    merged.structured.applicantCompany,
    "address2",
    pdf.applicant.address2
  );
  mergeFromPdf(merged.structured.applicantCompany, "city", pdf.applicant.city);
  mergeFromPdf(
    merged.structured.applicantCompany,
    "state",
    pdf.applicant.state
  );
  mergeFromPdf(merged.structured.applicantCompany, "zip", pdf.applicant.zip);
  mergeFromPdf(
    merged.structured.applicantCompany,
    "phone",
    pdf.applicant.phone
  );
  mergeFromPdf(
    merged.structured.applicantCompany,
    "email",
    pdf.applicant.email
  );

  mergeFromPdf(merged.structured.project, "name", pdf.project.name);
  mergeFromPdf(merged.structured.project, "startDate", pdf.project.startDate);
  mergeFromPdf(
    merged.structured.project,
    "endDate",
    pdf.project.completionDate
  );
  mergeFromPdf(
    merged.structured.project,
    "description",
    pdf.project.description
  );

  if (!merged.coordinates && pdf.coordinates) {
    merged.coordinates = {
      latitude: pdf.coordinates.latitude,
      longitude: pdf.coordinates.longitude,
    };
  }

  return merged;
}

function mergeFromPdf<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: string
): void {
  const incoming = value.trim();
  if (!incoming) {
    return;
  }

  const current = target[key];
  if (typeof current !== "string") {
    return;
  }

  target[key] = incoming as T[K];
}
