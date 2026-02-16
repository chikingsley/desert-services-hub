/**
 * Canonical narrative field definitions for SWPPP variable extraction.
 *
 * These map the raw extraction keys (from inventory-swppp-variables) into a
 * smaller set of human-meaningful fields grouped by domain.
 *
 * Used by: diff-narratives.ts, report-variable-inventory.ts
 */
import type { CanonField } from "./shared";
import {
  findEmailInValues,
  findFirstNonEmpty,
  findPhoneInValues,
  tryParseAcres,
  tryParseCityStateZip,
} from "./shared";

export function canonicalFields(): { group: string; fields: CanonField[] }[] {
  return [
    {
      fields: [
        {
          id: "project.name",
          label: "Project name",
          sources: [
            "1.1 Project/Site Information.UNLABELED.project_name",
            "SECTION 8: CERTIFICATION AND NOTIFICATION.Project Name",
            "SECTION 8: CERTIFICATION AND NOTIFICATION.Project Title",
          ],
        },
        {
          id: "project.address_line1",
          label: "Project address line 1",
          sources: [
            "1.1 Project/Site Information.UNLABELED.address_line1",
            "TITLE.SWPPP Contact(s).Line2",
            "1.2 Contact Information/Responsable Parties.Project Manager.Line2",
          ],
        },
        {
          id: "project.city_state_zip",
          label: "Project city/state/zip (single line)",
          sources: [
            "1.1 Project/Site Information.UNLABELED.address_line2",
            "TITLE.SWPPP Contact(s).Line3",
            "1.2 Contact Information/Responsable Parties.Project Manager.Line3",
          ],
        },
        {
          id: "project.city",
          label: "Project city (derived)",
          derive: (doc) => {
            const raw = findFirstNonEmpty(doc, [
              "1.1 Project/Site Information.UNLABELED.address_line2",
              "TITLE.SWPPP Contact(s).Line3",
            ]);
            const parsed = raw ? tryParseCityStateZip(raw) : null;
            return parsed?.city ?? "";
          },
        },
        {
          id: "project.state",
          label: "Project state (derived)",
          derive: (doc) => {
            const raw = findFirstNonEmpty(doc, [
              "1.1 Project/Site Information.UNLABELED.address_line2",
              "TITLE.SWPPP Contact(s).Line3",
            ]);
            const parsed = raw ? tryParseCityStateZip(raw) : null;
            return parsed?.state ?? "";
          },
        },
        {
          id: "project.zip",
          label: "Project zip (derived)",
          derive: (doc) => {
            const raw = findFirstNonEmpty(doc, [
              "1.1 Project/Site Information.UNLABELED.address_line2",
              "TITLE.SWPPP Contact(s).Line3",
            ]);
            const parsed = raw ? tryParseCityStateZip(raw) : null;
            return parsed?.zip ?? "";
          },
        },
        {
          id: "project.county",
          label: "County",
          sources: [
            "1.1 Project/Site Information.County or Similar Subdivision",
          ],
        },
      ],
      group: "Project",
    },
    {
      fields: [
        {
          id: "permit.azpdes_number",
          label: "AZPDES tracking number",
          sources: [
            "1.1 Project/Site Information.AZPDES project or permit tracking number*",
            "TITLE.SWPPP Contact(s).AZPDES number",
          ],
        },
        {
          id: "permit.azcon_number",
          label: "AZCON tracking number",
          sources: [
            "1.1 Project/Site Information.AZCON project or permit tracking number*",
            "TITLE.SWPPP Contact(s).AZCON number",
          ],
        },
        {
          id: "permit.number_best_effort",
          label: "Permit number (best-effort AZPDES/AZCON)",
          derive: (doc) => {
            const azpdes = findFirstNonEmpty(doc, [
              "1.1 Project/Site Information.AZPDES project or permit tracking number*",
              "TITLE.SWPPP Contact(s).AZPDES number",
            ]);
            if (azpdes) {
              return azpdes;
            }
            const azcon = findFirstNonEmpty(doc, [
              "1.1 Project/Site Information.AZCON project or permit tracking number*",
              "TITLE.SWPPP Contact(s).AZCON number",
            ]);
            return azcon;
          },
        },
      ],
      group: "Permit",
    },
    {
      fields: [
        {
          id: "dates.swppp_preparation_date",
          label: "SWPPP preparation date",
          sources: ["TITLE.SWPPP Contact(s).SWPPP Preparation Date"],
        },
        {
          id: "dates.project_start",
          label: "Estimated project start date",
          sources: [
            "1.3 Nature and Sequence of Construction Activity.Estimated Project Start Date",
            "TITLE.SWPPP Contact(s).Project Start Date",
          ],
        },
        {
          id: "dates.project_completion",
          label: "Estimated project completion date",
          sources: [
            "1.3 Nature and Sequence of Construction Activity.Estimated Project Completion Date",
          ],
        },
      ],
      group: "Dates",
    },
    {
      fields: [
        {
          id: "operator.company",
          label: "Operator company",
          sources: [
            "1.2 Contact Information/Responsable Parties.Operator(s).Line1",
            "TITLE.Operator(s).Line1",
          ],
        },
        {
          id: "operator.contact_name",
          label: "Operator contact name",
          sources: [
            "1.2 Contact Information/Responsable Parties.Operator(s).Contact",
            "TITLE.Operator(s).Contact",
          ],
        },
        {
          id: "operator.phone",
          label: "Operator phone",
          sources: [
            "1.2 Contact Information/Responsable Parties.Operator(s).Phone",
            "TITLE.Operator(s).Phone",
            "TITLE.Phone",
          ],
        },
        {
          id: "operator.email",
          label: "Operator email (best-effort scan)",
          derive: (doc, allKeys) => {
            const values: string[] = [];
            for (const k of allKeys) {
              if (
                k.startsWith("TITLE.Operator(s).Line") ||
                k.startsWith(
                  "1.2 Contact Information/Responsable Parties.Operator(s).Line"
                )
              ) {
                const v = doc.get(k);
                if (v) {
                  values.push(v);
                }
              }
            }
            return findEmailInValues(values);
          },
        },
        {
          id: "operator.address_line1",
          label: "Operator address line 1",
          sources: [
            "1.2 Contact Information/Responsable Parties.Operator(s).Line2",
            "TITLE.Operator(s).Line2",
          ],
        },
        {
          id: "operator.city_state_zip",
          label: "Operator city/state/zip",
          sources: [
            "1.2 Contact Information/Responsable Parties.Operator(s).Line3",
            "TITLE.Operator(s).Line3",
          ],
        },
        {
          id: "swppp_contact.name",
          label: "SWPPP contact name (best-effort)",
          sources: [
            "TITLE.SWPPP Contact(s).Line1",
            "1.2 Contact Information/Responsable Parties.SWPPP Contact(s).Line1",
          ],
        },
        {
          id: "swppp_contact.phone",
          label: "SWPPP contact phone",
          sources: [
            "1.2 Contact Information/Responsable Parties.SWPPP Contact(s).Phone",
            "TITLE.SWPPP Contact(s).Phone",
            "TITLE.Phone",
          ],
        },
        {
          id: "emergency.contact_name",
          label: "Emergency 24-hour contact name (best-effort scan)",
          derive: (doc, allKeys) => {
            const values: string[] = [];
            for (const k of allKeys) {
              if (
                k.startsWith(
                  "1.2 Contact Information/Responsable Parties.Emergency 24-Hour Contact.Line"
                )
              ) {
                const v = doc.get(k);
                if (v) {
                  values.push(v);
                }
              }
            }
            const line2 = doc.get(
              "1.2 Contact Information/Responsable Parties.Emergency 24-Hour Contact.Line2"
            );
            if (line2?.trim()) {
              return line2.trim();
            }
            return values[0]?.trim() ?? "";
          },
        },
        {
          id: "emergency.phone",
          label: "Emergency 24-hour phone (best-effort scan)",
          derive: (doc, allKeys) => {
            const values: string[] = [];
            for (const k of allKeys) {
              if (
                k.startsWith(
                  "1.2 Contact Information/Responsable Parties.Emergency 24-Hour Contact.Line"
                )
              ) {
                const v = doc.get(k);
                if (v) {
                  values.push(v);
                }
              }
            }
            const line3 = doc.get(
              "1.2 Contact Information/Responsable Parties.Emergency 24-Hour Contact.Line3"
            );
            if (line3) {
              const p = findPhoneInValues([line3]);
              if (p) {
                return p;
              }
            }
            return findPhoneInValues(values);
          },
        },
      ],
      group: "Contacts",
    },
    {
      fields: [
        {
          id: "site.total_project_area_acres",
          label: "Total project area (acres; raw)",
          sources: ["1.5 Construction Site Estimates.Total project area"],
        },
        {
          id: "site.total_project_area_acres_number",
          label: "Total project area (acres; numeric derived)",
          derive: (doc) => {
            const raw = findFirstNonEmpty(doc, [
              "1.5 Construction Site Estimates.Total project area",
            ]);
            const n = raw ? tryParseAcres(raw) : null;
            return n === null ? "" : String(n);
          },
        },
        {
          id: "site.disturbed_area_acres",
          label: "Disturbed area (acres; raw)",
          sources: [
            "1.5 Construction Site Estimates.Construction site area to be disturbed",
          ],
        },
        {
          id: "site.disturbed_area_acres_number",
          label: "Disturbed area (acres; numeric derived)",
          derive: (doc) => {
            const raw = findFirstNonEmpty(doc, [
              "1.5 Construction Site Estimates.Construction site area to be disturbed",
            ]);
            const n = raw ? tryParseAcres(raw) : null;
            return n === null ? "" : String(n);
          },
        },
        {
          id: "site.soil_types",
          label: "Soil type(s)",
          sources: [
            "1.4 Soils, Slopes, Vegetation, and Current Drainage Patterns.Soil type(s)",
          ],
        },
        {
          id: "site.slopes",
          label: "Slopes (often blank)",
          sources: [
            "1.4 Soils, Slopes, Vegetation, and Current Drainage Patterns.Slopes",
          ],
        },
        {
          id: "site.receiving_waters",
          label: "Receiving waters",
          sources: ["1.6 Receiving waters.Description of receiving waters"],
        },
        {
          id: "site.storm_sewer_systems",
          label: "Storm sewer systems / MS4",
          sources: ["1.6 Receiving waters.Description of storm sewer systems"],
        },
      ],
      group: "Site Details",
    },
    {
      fields: [
        {
          id: "bmp.ec7.responsible_staff",
          label: "BMP EC-7 responsible staff",
          sources: ["2.4 Stabilize Soils.BMP EC-7.Responsible Staff"],
        },
        {
          id: "bmp.ec7.installation_schedule",
          label: "BMP EC-7 installation schedule",
          sources: ["2.4 Stabilize Soils.BMP EC-7.Installation Schedule"],
        },
        {
          id: "bmp.ec7.maintenance",
          label: "BMP EC-7 maintenance/inspection",
          sources: ["2.4 Stabilize Soils.BMP EC-7.Maintenance and Inspection"],
        },
      ],
      group: "BMP (High Variance)",
    },
  ];
}
