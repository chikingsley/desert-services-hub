/**
 * Canonical field contract for SWPPP narrative generation.
 *
 * Source: Eva -> Jayson narrative corpus analysis.
 * This is the deterministic, type-safe field surface we should map from
 * source docs (NOI / SWPPP plan / estimate) before rendering templates.
 */

export type CanonicalGroup =
  | "project"
  | "permit"
  | "dates"
  | "contacts"
  | "site"
  | "bmp";

export interface CanonicalField {
  id: string;
  group: CanonicalGroup;
  required: boolean;
  label: string;
  description: string;
  sourceKeys: readonly string[];
}

export const CANONICAL_FIELDS: readonly CanonicalField[] = [
  {
    description: "Primary project/site name.",
    group: "project",
    id: "project.name",
    label: "Project name",
    required: true,
    sourceKeys: [
      "1.1 Project/Site Information.UNLABELED.project_name",
      "SECTION 8: CERTIFICATION AND NOTIFICATION.Project Name",
      "SECTION 8: CERTIFICATION AND NOTIFICATION.Project Title",
    ],
  },
  {
    description:
      "Street or site location line. Cross-street descriptors (e.g. 'NWC A & B') are acceptable when no street number is provided.",
    group: "project",
    id: "project.address_line1",
    label: "Project address line 1",
    required: true,
    sourceKeys: [
      "1.1 Project/Site Information.UNLABELED.address_line1",
      "TITLE.SWPPP Contact(s).Line2",
    ],
  },
  {
    description: "City/state/ZIP line from narrative body/title.",
    group: "project",
    id: "project.city_state_zip",
    label: "Project city/state/zip",
    required: true,
    sourceKeys: [
      "1.1 Project/Site Information.UNLABELED.address_line2",
      "TITLE.SWPPP Contact(s).Line3",
    ],
  },
  {
    description: "County or similar subdivision.",
    group: "project",
    id: "project.county",
    label: "County",
    required: true,
    sourceKeys: ["1.1 Project/Site Information.County or Similar Subdivision"],
  },
  {
    description: "AZPDES permit tracking number when used.",
    group: "permit",
    id: "permit.azpdes_number",
    label: "AZPDES number",
    required: false,
    sourceKeys: [
      "1.1 Project/Site Information.AZPDES project or permit tracking number*",
      "TITLE.SWPPP Contact(s).AZPDES number",
    ],
  },
  {
    description: "AZCON permit tracking number when used.",
    group: "permit",
    id: "permit.azcon_number",
    label: "AZCON number",
    required: false,
    sourceKeys: [
      "1.1 Project/Site Information.AZCON project or permit tracking number*",
      "TITLE.SWPPP Contact(s).AZCON number",
    ],
  },
  {
    description: "Date on title/cover indicating SWPPP preparation.",
    group: "dates",
    id: "dates.swppp_preparation_date",
    label: "SWPPP preparation date",
    required: true,
    sourceKeys: ["TITLE.SWPPP Contact(s).SWPPP Preparation Date"],
  },
  {
    description: "Estimated start date for construction activity.",
    group: "dates",
    id: "dates.project_start",
    label: "Estimated project start date",
    required: true,
    sourceKeys: [
      "1.3 Nature and Sequence of Construction Activity.Estimated Project Start Date",
      "TITLE.SWPPP Contact(s).Project Start Date",
    ],
  },
  {
    description: "Estimated completion date for construction activity.",
    group: "dates",
    id: "dates.project_completion",
    label: "Estimated project completion date",
    required: true,
    sourceKeys: [
      "1.3 Nature and Sequence of Construction Activity.Estimated Project Completion Date",
    ],
  },
  {
    description: "Legal entity/operator name.",
    group: "contacts",
    id: "operator.company",
    label: "Operator company",
    required: true,
    sourceKeys: [
      "1.2 Contact Information/Responsable Parties.Operator(s).Line1",
      "TITLE.Operator(s).Line1",
    ],
  },
  {
    description: "Primary named operator contact.",
    group: "contacts",
    id: "operator.contact_name",
    label: "Operator contact name",
    required: true,
    sourceKeys: [
      "1.2 Contact Information/Responsable Parties.Operator(s).Contact",
      "TITLE.Operator(s).Contact",
    ],
  },
  {
    description: "Operator phone number.",
    group: "contacts",
    id: "operator.phone",
    label: "Operator phone",
    required: true,
    sourceKeys: [
      "1.2 Contact Information/Responsable Parties.Operator(s).Phone",
      "TITLE.Operator(s).Phone",
      "TITLE.Phone",
    ],
  },
  {
    description: "Operator mailing/street address.",
    group: "contacts",
    id: "operator.address_line1",
    label: "Operator address line 1",
    required: false,
    sourceKeys: [
      "1.2 Contact Information/Responsable Parties.Operator(s).Line2",
      "TITLE.Operator(s).Line2",
    ],
  },
  {
    description: "Operator city/state/ZIP line.",
    group: "contacts",
    id: "operator.city_state_zip",
    label: "Operator city/state/zip",
    required: false,
    sourceKeys: [
      "1.2 Contact Information/Responsable Parties.Operator(s).Line3",
      "TITLE.Operator(s).Line3",
    ],
  },
  {
    description: "Named SWPPP contact.",
    group: "contacts",
    id: "swppp_contact.name",
    label: "SWPPP contact name",
    required: true,
    sourceKeys: [
      "TITLE.SWPPP Contact(s).Line1",
      "1.2 Contact Information/Responsable Parties.SWPPP Contact(s).Line1",
    ],
  },
  {
    description: "SWPPP contact phone number.",
    group: "contacts",
    id: "swppp_contact.phone",
    label: "SWPPP contact phone",
    required: true,
    sourceKeys: [
      "1.2 Contact Information/Responsable Parties.SWPPP Contact(s).Phone",
      "TITLE.SWPPP Contact(s).Phone",
      "TITLE.Phone",
    ],
  },
  {
    description: "24-hour emergency contact (often same as operator contact).",
    group: "contacts",
    id: "emergency.contact_name",
    label: "Emergency contact name",
    required: true,
    sourceKeys: [
      "1.2 Contact Information/Responsable Parties.Emergency 24-Hour Contact.Line1",
      "1.2 Contact Information/Responsable Parties.Emergency 24-Hour Contact.Line2",
    ],
  },
  {
    description: "24-hour emergency phone.",
    group: "contacts",
    id: "emergency.phone",
    label: "Emergency phone",
    required: true,
    sourceKeys: [
      "1.2 Contact Information/Responsable Parties.Emergency 24-Hour Contact.Line3",
    ],
  },
  {
    description: "Total project acreage as shown in section 1.5.",
    group: "site",
    id: "site.total_project_area",
    label: "Total project area",
    required: true,
    sourceKeys: ["1.5 Construction Site Estimates.Total project area"],
  },
  {
    description: "Construction disturbance acreage.",
    group: "site",
    id: "site.disturbed_area",
    label: "Disturbed area",
    required: true,
    sourceKeys: [
      "1.5 Construction Site Estimates.Construction site area to be disturbed",
    ],
  },
  {
    description: "Soils and related descriptors used in the narrative.",
    group: "site",
    id: "site.soil_types",
    label: "Soil type(s)",
    required: true,
    sourceKeys: [
      "1.4 Soils, Slopes, Vegetation, and Current Drainage Patterns.Soil type(s)",
    ],
  },
  {
    description: "Slope description (frequently blank in source docs).",
    group: "site",
    id: "site.slopes",
    label: "Slopes",
    required: false,
    sourceKeys: [
      "1.4 Soils, Slopes, Vegetation, and Current Drainage Patterns.Slopes",
    ],
  },
  {
    description: "Receiving waters text from section 1.6.",
    group: "site",
    id: "site.receiving_waters",
    label: "Receiving waters",
    required: false,
    sourceKeys: ["1.6 Receiving waters.Description of receiving waters"],
  },
  {
    description: "Storm sewer / MS4 text from section 1.6.",
    group: "site",
    id: "site.storm_sewer_systems",
    label: "Storm sewer systems / MS4",
    required: false,
    sourceKeys: ["1.6 Receiving waters.Description of storm sewer systems"],
  },
  {
    description: "Responsible staff for dust-control BMP EC-7.",
    group: "bmp",
    id: "bmp.ec7.responsible_staff",
    label: "BMP EC-7 responsible staff",
    required: false,
    sourceKeys: ["2.4 Stabilize Soils.BMP EC-7.Responsible Staff"],
  },
] as const;

export const CANONICAL_FIELD_IDS = new Set(CANONICAL_FIELDS.map((f) => f.id));
