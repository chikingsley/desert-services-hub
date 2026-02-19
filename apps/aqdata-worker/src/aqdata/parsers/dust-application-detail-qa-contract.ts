import { z } from "zod";

const APPLICATION_ID_REGEX = /^D\d+$/i;
const DATE_MM_DD_YYYY_OR_ISO_REGEX =
  /^(?:\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})$/;
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const DATE_OR_EMPTY_SCHEMA = z
  .string()
  .refine((value) => value === "" || DATE_MM_DD_YYYY_OR_ISO_REGEX.test(value), {
    message: "Expected date in MM/DD/YYYY or YYYY-MM-DD format.",
  });

const EMAIL_OR_EMPTY_SCHEMA = z
  .string()
  .refine((value) => value === "" || EMAIL_REGEX.test(value), {
    message: "Expected a valid email address.",
  });

export const DUST_APPLICATION_DETAIL_CONTRACT_SCHEMA = z.object({
  applicationId: z.string().regex(APPLICATION_ID_REGEX),
  attachments: z.array(
    z.object({
      attachmentId: z.string(),
      attachmentType: z.string(),
      description: z.string(),
      status: z.string(),
      uploadDate: z.string(),
      url: z.string(),
    })
  ),
  coordinates: z
    .object({
      latitude: z.number().gte(-90).lte(90),
      longitude: z.number().gte(-180).lte(180),
    })
    .nullable(),
  detailFields: z.record(z.string(), z.string()),
  documentLinks: z.array(z.string()),
  permitDocument: z
    .object({
      attachmentId: z.string(),
      attachmentType: z.string(),
      description: z.string(),
      status: z.string(),
      uploadDate: z.string(),
      url: z.string(),
    })
    .nullable(),
  permitPdf: z
    .object({
      bytes: z.number().int().nonnegative(),
      contentType: z.string().nullable(),
      emails: z.array(EMAIL_OR_EMPTY_SCHEMA),
      extractionMethod: z.union([z.literal("pdftotext"), z.literal("pdfjs")]),
      fields: z.object({
        applicant: z.object({
          address1: z.string(),
          address2: z.string(),
          city: z.string(),
          companyName: z.string(),
          email: EMAIL_OR_EMPTY_SCHEMA,
          entityType: z.string(),
          phone: z.string(),
          state: z.string(),
          zip: z.string(),
        }),
        applicationStatus: z.string(),
        attention: z.string(),
        blockPermit: z.string(),
        coordinates: z
          .object({
            latitude: z.number().gte(-90).lte(90),
            longitude: z.number().gte(-180).lte(180),
          })
          .nullable(),
        expirationDate: DATE_OR_EMPTY_SCHEMA,
        facilityId: z.string(),
        issueDate: DATE_OR_EMPTY_SCHEMA,
        parcel: z.string(),
        permitContactEmail: EMAIL_OR_EMPTY_SCHEMA,
        permitContactName: z.string(),
        permitContactPhone: z.string(),
        primaryContact: z.object({
          companyName: z.string(),
          email: EMAIL_OR_EMPTY_SCHEMA,
          fax: z.string(),
          firstName: z.string(),
          lastName: z.string(),
          mobile: z.string(),
          onSitePhone: z.string(),
          title: z.string(),
        }),
        project: z.object({
          acreage: z.string(),
          completionDate: DATE_OR_EMPTY_SCHEMA,
          description: z.string(),
          name: z.string(),
          startDate: DATE_OR_EMPTY_SCHEMA,
          type: z.string(),
        }),
        siteAddress: z.string(),
        submittedDate: DATE_OR_EMPTY_SCHEMA,
      }),
      labelValues: z.record(z.string(), z.string()),
      pageCount: z.number().int().positive().nullable(),
      warnings: z.array(z.string()),
    })
    .nullable(),
  structured: z.object({
    applicantCompany: z.object({
      address1: z.string(),
      address2: z.string(),
      city: z.string(),
      companyName: z.string(),
      email: EMAIL_OR_EMPTY_SCHEMA,
      entityType: z.string(),
      phone: z.string(),
      state: z.string(),
      zip: z.string(),
    }),
    applicantOwner: z.object({
      address1: z.string(),
      address2: z.string(),
      city: z.string(),
      email: EMAIL_OR_EMPTY_SCHEMA,
      firstName: z.string(),
      lastName: z.string(),
      phone: z.string(),
      state: z.string(),
      zip: z.string(),
    }),
    contact: z.object({
      email: EMAIL_OR_EMPTY_SCHEMA,
      name: z.string(),
      phone: z.string(),
    }),
    header: z.object({
      applicationId: z.string(),
      companyName: z.string(),
      createdDate: DATE_OR_EMPTY_SCHEMA,
      expirationDate: DATE_OR_EMPTY_SCHEMA,
      issueDate: DATE_OR_EMPTY_SCHEMA,
      projectName: z.string(),
      status: z.string(),
    }),
    isOwnerDeveloper: z.boolean().nullable(),
    primaryContact: z.object({
      companyName: z.string(),
      email: EMAIL_OR_EMPTY_SCHEMA,
      fax: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      mobile: z.string(),
      onSitePhone: z.string(),
      title: z.string(),
    }),
    project: z.object({
      description: z.string(),
      endDate: DATE_OR_EMPTY_SCHEMA,
      name: z.string(),
      startDate: DATE_OR_EMPTY_SCHEMA,
    }),
    propertyOwnerDeveloper: z
      .object({
        address1: z.string(),
        address2: z.string(),
        city: z.string(),
        contactEmail: EMAIL_OR_EMPTY_SCHEMA,
        contactFirstName: z.string(),
        contactLastName: z.string(),
        contactPhone: z.string(),
        entityType: z.string(),
        fax: z.string(),
        name: z.string(),
        phone: z.string(),
        state: z.string(),
        zip: z.string(),
      })
      .nullable(),
    siteLocation: z.object({
      accessPoints: z.array(
        z.object({
          latitude: z.string(),
          longitude: z.string(),
        })
      ),
      disturbedArea: z.string(),
      locations: z.array(
        z.object({
          address: z.string(),
          city: z.string(),
          county: z.string(),
          isSelected: z.boolean(),
          latitude: z.string(),
          longitude: z.string(),
          parcel: z.string(),
          state: z.string(),
          zip: z.string(),
        })
      ),
    }),
    trackoutDevices: z.object({
      gravelPad: z.boolean(),
      grizzlyRumbleGrate: z.boolean(),
      other: z.boolean(),
      pavedArea: z.boolean(),
      wheelWash: z.boolean(),
    }),
    trackoutE1Answer: z.boolean().nullable(),
    waterMethods: z.object({
      hose: z.boolean(),
      other: z.boolean(),
      waterBuffalo: z.boolean(),
      waterPull: z.boolean(),
      waterTruck: z.boolean(),
    }),
  }),
});
