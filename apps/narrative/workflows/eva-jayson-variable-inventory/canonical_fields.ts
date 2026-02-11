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

export type CanonicalField = {
  id: string;
  group: CanonicalGroup;
  required: boolean;
  label: string;
  description: string;
  sourceKeys: readonly string[];
};

export const CANONICAL_FIELDS: readonly CanonicalField[] = [
  {
    id: "project.name",
    group: "project",
    required: true,
    label: "Project name",
    description: "Primary project/site name.",
    sourceKeys: [
      "1.1 Project/Site Information.UNLABELED.project_name",
      "SECTION 8: CERTIFICATION AND NOTIFICATION.Project Name",
      "SECTION 8: CERTIFICATION AND NOTIFICATION.Project Title",
    ],
  },
  {
    id: "project.address_line1",
    group: "project",
    required: true,
    label: "Project address line 1",
    description: "Street or site location line.",
    sourceKeys: [
      "1.1 Project/Site Information.UNLABELED.address_line1",
      "TITLE.SWPPP Contact(s).Line2",
    ],
  },
  {
    id: "project.city_state_zip",
    group: "project",
    required: true,
    label: "Project city/state/zip",
    description: "City/state/ZIP line from narrative body/title.",
    sourceKeys: [
      "1.1 Project/Site Information.UNLABELED.address_line2",
      "TITLE.SWPPP Contact(s).Line3",
    ],
  },
  {
    id: "project.county",
    group: "project",
    required: true,
    label: "County",
    description: "County or similar subdivision.",
    sourceKeys: ["1.1 Project/Site Information.County or Similar Subdivision"],
  },
  {
    id: "permit.azpdes_number",
    group: "permit",
    required: false,
    label: "AZPDES number",
    description: "AZPDES permit tracking number when used.",
    sourceKeys: [
      "1.1 Project/Site Information.AZPDES project or permit tracking number*",
      "TITLE.SWPPP Contact(s).AZPDES number",
    ],
  },
  {
    id: "permit.azcon_number",
    group: "permit",
    required: false,
    label: "AZCON number",
    description: "AZCON permit tracking number when used.",
    sourceKeys: [
      "1.1 Project/Site Information.AZCON project or permit tracking number*",
      "TITLE.SWPPP Contact(s).AZCON number",
    ],
  },
  {
    id: "dates.swppp_preparation_date",
    group: "dates",
    required: true,
    label: "SWPPP preparation date",
    description: "Date on title/cover indicating SWPPP preparation.",
    sourceKeys: ["TITLE.SWPPP Contact(s).SWPPP Preparation Date"],
  },
  {
    id: "dates.project_start",
    group: "dates",
    required: true,
    label: "Estimated project start date",
    description: "Estimated start date for construction activity.",
    sourceKeys: [
      "1.3 Nature and Sequence of Construction Activity.Estimated Project Start Date",
      "TITLE.SWPPP Contact(s).Project Start Date",
    ],
  },
  {
    id: "dates.project_completion",
    group: "dates",
    required: true,
    label: "Estimated project completion date",
    description: "Estimated completion date for construction activity.",
    sourceKeys: ["1.3 Nature and Sequence of Construction Activity.Estimated Project Completion Date"],
  },
  {
    id: "operator.company",
    group: "contacts",
    required: true,
    label: "Operator company",
    description: "Legal entity/operator name.",
    sourceKeys: [
      "1.2 Contact Information/Responsable Parties.Operator(s).Line1",
      "TITLE.Operator(s).Line1",
    ],
  },
  {
    id: "operator.contact_name",
    group: "contacts",
    required: true,
    label: "Operator contact name",
    description: "Primary named operator contact.",
    sourceKeys: [
      "1.2 Contact Information/Responsable Parties.Operator(s).Contact",
      "TITLE.Operator(s).Contact",
    ],
  },
  {
    id: "operator.phone",
    group: "contacts",
    required: true,
    label: "Operator phone",
    description: "Operator phone number.",
    sourceKeys: [
      "1.2 Contact Information/Responsable Parties.Operator(s).Phone",
      "TITLE.Operator(s).Phone",
      "TITLE.Phone",
    ],
  },
  {
    id: "operator.address_line1",
    group: "contacts",
    required: false,
    label: "Operator address line 1",
    description: "Operator mailing/street address.",
    sourceKeys: [
      "1.2 Contact Information/Responsable Parties.Operator(s).Line2",
      "TITLE.Operator(s).Line2",
    ],
  },
  {
    id: "operator.city_state_zip",
    group: "contacts",
    required: false,
    label: "Operator city/state/zip",
    description: "Operator city/state/ZIP line.",
    sourceKeys: [
      "1.2 Contact Information/Responsable Parties.Operator(s).Line3",
      "TITLE.Operator(s).Line3",
    ],
  },
  {
    id: "swppp_contact.name",
    group: "contacts",
    required: true,
    label: "SWPPP contact name",
    description: "Named SWPPP contact.",
    sourceKeys: [
      "TITLE.SWPPP Contact(s).Line1",
      "1.2 Contact Information/Responsable Parties.SWPPP Contact(s).Line1",
    ],
  },
  {
    id: "swppp_contact.phone",
    group: "contacts",
    required: true,
    label: "SWPPP contact phone",
    description: "SWPPP contact phone number.",
    sourceKeys: [
      "1.2 Contact Information/Responsable Parties.SWPPP Contact(s).Phone",
      "TITLE.SWPPP Contact(s).Phone",
      "TITLE.Phone",
    ],
  },
  {
    id: "emergency.contact_name",
    group: "contacts",
    required: true,
    label: "Emergency contact name",
    description: "24-hour emergency contact (often same as operator contact).",
    sourceKeys: [
      "1.2 Contact Information/Responsable Parties.Emergency 24-Hour Contact.Line1",
      "1.2 Contact Information/Responsable Parties.Emergency 24-Hour Contact.Line2",
    ],
  },
  {
    id: "emergency.phone",
    group: "contacts",
    required: true,
    label: "Emergency phone",
    description: "24-hour emergency phone.",
    sourceKeys: ["1.2 Contact Information/Responsable Parties.Emergency 24-Hour Contact.Line3"],
  },
  {
    id: "site.total_project_area",
    group: "site",
    required: true,
    label: "Total project area",
    description: "Total project acreage as shown in section 1.5.",
    sourceKeys: ["1.5 Construction Site Estimates.Total project area"],
  },
  {
    id: "site.disturbed_area",
    group: "site",
    required: true,
    label: "Disturbed area",
    description: "Construction disturbance acreage.",
    sourceKeys: ["1.5 Construction Site Estimates.Construction site area to be disturbed"],
  },
  {
    id: "site.soil_types",
    group: "site",
    required: true,
    label: "Soil type(s)",
    description: "Soils and related descriptors used in the narrative.",
    sourceKeys: ["1.4 Soils, Slopes, Vegetation, and Current Drainage Patterns.Soil type(s)"],
  },
  {
    id: "site.slopes",
    group: "site",
    required: false,
    label: "Slopes",
    description: "Slope description (frequently blank in source docs).",
    sourceKeys: ["1.4 Soils, Slopes, Vegetation, and Current Drainage Patterns.Slopes"],
  },
  {
    id: "site.receiving_waters",
    group: "site",
    required: false,
    label: "Receiving waters",
    description: "Receiving waters text from section 1.6.",
    sourceKeys: ["1.6 Receiving waters.Description of receiving waters"],
  },
  {
    id: "site.storm_sewer_systems",
    group: "site",
    required: false,
    label: "Storm sewer systems / MS4",
    description: "Storm sewer / MS4 text from section 1.6.",
    sourceKeys: ["1.6 Receiving waters.Description of storm sewer systems"],
  },
  {
    id: "bmp.ec7.responsible_staff",
    group: "bmp",
    required: false,
    label: "BMP EC-7 responsible staff",
    description: "Responsible staff for dust-control BMP EC-7.",
    sourceKeys: ["2.4 Stabilize Soils.BMP EC-7.Responsible Staff"],
  },
] as const;

export const CANONICAL_FIELD_IDS = new Set(CANONICAL_FIELDS.map((f) => f.id));

