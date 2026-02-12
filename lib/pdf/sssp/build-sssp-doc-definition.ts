import type {
  Content,
  ContentTable,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import { COLORS, COMPANY, FONT_BODY } from "../shared/brand";
import { borderedLayout } from "../shared/layouts";
import type { SsspDocument, SsspScopeItem, SsspSection } from "./types";

const YYYY_MM_DD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MULTILINE_SPLIT_RE = /\r?\n/;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function formatCoverDateUpper(dateStr: string | undefined): string {
  const raw = (dateStr ?? "").trim();
  if (!raw) {
    return "";
  }

  // Treat yyyy-mm-dd as a *local* calendar date (Date("YYYY-MM-DD") is UTC and can shift a day in US timezones).
  const m = raw.match(YYYY_MM_DD_RE);
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(raw);
  if (!Number.isFinite(d.getTime())) {
    return raw.toUpperCase();
  }

  const month = MONTHS[d.getMonth()] ?? "";
  return `${month} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatCoverAddress(address: string): string {
  // Keep user-provided formatting (from the subcontract), but normalize separators.
  // Requested: comma separation, title case (no forced ALL CAPS).
  const a = address.trim();
  if (!a) {
    return "";
  }
  return a
    .replace(/\s*;\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function pageTitle(text: string): Content {
  return {
    text,
    bold: true,
    fontSize: 12,
    margin: [0, 0, 0, 8],
  };
}

function label(text: string, marginBottom = 4): Content {
  return {
    text,
    bold: true,
    margin: [0, 0, 0, marginBottom],
  };
}

function paragraph(text: string, marginBottom = 10): Content {
  return {
    text,
    margin: [0, 0, 0, marginBottom],
    lineHeight: 1.15,
  };
}

function scopeItemsOrFallback(doc: SsspDocument): SsspScopeItem[] {
  if (doc.scopeItems && doc.scopeItems.length > 0) {
    return doc.scopeItems;
  }
  const s = (doc.scopeOfWork ?? "").trim();
  if (!s) {
    return [];
  }
  return [{ title: "Scope of Work:", details: [s] }];
}

function scopeBlobForHeuristics(scopeItems: SsspScopeItem[]): string {
  return scopeItems
    .map((s) => [s.title, ...(s.details ?? [])].join(" "))
    .join(" ")
    .toLowerCase();
}

function resolveSectionVisibility(
  override: boolean | "auto" | undefined,
  inferred: boolean
): boolean {
  if (override === undefined || override === "auto") {
    return inferred;
  }
  return override;
}

function normalizeExplicitSections(
  sections: SsspDocument["sections"]
): Set<SsspSection> | undefined {
  if (sections === undefined) {
    return undefined;
  }

  const valid = new Set<SsspSection>([
    "water-truck",
    "street-sweeping",
    "portable-sanitation",
  ]);
  const selected = new Set<SsspSection>();

  for (const section of sections) {
    if (valid.has(section)) {
      selected.add(section);
    }
  }

  return selected;
}

function emergencyContactsTable(doc: SsspDocument): ContentTable {
  const cellMargin: [number, number, number, number] = [6, 6, 6, 6];
  const emptyMargin: [number, number, number, number] = [6, 16, 6, 16];
  const nameLineMargin: [number, number, number, number] = [0, 0, 0, 2];

  const rows: ContentTable["table"]["body"] = (doc.contacts ?? []).map((c) => {
    const name = (c.name ?? "").trim();
    const email = (c.email ?? "").trim();
    const phoneLines = (c.phone ?? "")
      .split(MULTILINE_SPLIT_RE)
      .map((s) => s.trim())
      .filter(Boolean);
    const phoneStack: Content[] = phoneLines.length
      ? phoneLines.map((line, i) => ({
          text: line,
          noWrap: true,
          margin: [0, 0, 0, i < phoneLines.length - 1 ? 2 : 0] as [
            number,
            number,
            number,
            number,
          ],
        }))
      : [{ text: "", noWrap: true }];

    return [
      { text: c.role ?? "", margin: cellMargin },
      {
        stack: [
          { text: name, margin: nameLineMargin },
          ...(email
            ? [
                {
                  text: email,
                  fontSize: 10,
                  color: COLORS.mutedForeground,
                } as Content,
              ]
            : []),
        ],
        margin: cellMargin,
      },
      {
        stack: phoneStack,
        margin: cellMargin,
      },
      { text: (c.notes ?? "").trim(), margin: cellMargin },
    ];
  });

  return {
    fontSize: 10,
    table: {
      // Role is least important; notes are most important.
      widths: [70, 140, "auto", "*"],
      body: [
        [
          { text: "Role", bold: true, margin: cellMargin },
          { text: "Contact Name", bold: true, margin: cellMargin },
          { text: "Phone Number", bold: true, margin: cellMargin },
          { text: "Notes", bold: true, margin: cellMargin },
        ],
        ...(rows.length > 0
          ? rows
          : ([
              [
                { text: "", margin: emptyMargin },
                { text: "", margin: emptyMargin },
                { text: "", margin: emptyMargin },
                { text: "", margin: emptyMargin },
              ],
            ] as ContentTable["table"]["body"])),
      ],
    },
    layout: borderedLayout,
  };
}

export function buildSsspDocDefinition(
  doc: SsspDocument,
  logoBase64: string
): TDocumentDefinitions {
  const PAGE_W = 612;
  const PAGE_H = 792;
  // Requested: border is ~0.5" inset from page edge.
  const BORDER_INSET = 36;
  // Requested: content is inset another ~0.5" from the border (total ~1" from page edge).
  const CONTENT_INSET_FROM_BORDER = 36;
  const CONTENT_MARGIN_X = BORDER_INSET + CONTENT_INSET_FROM_BORDER;
  // Footer separator line sits above the border bottom (close to the PHX07 example).
  const FOOTER_SEP_OFFSET_FROM_BORDER_BOTTOM = 42;
  const FOOTER_SEP_Y =
    PAGE_H - BORDER_INSET - FOOTER_SEP_OFFSET_FROM_BORDER_BOTTOM;
  // Cover page uses a higher divider so the company band can sit with 0.5" top/bottom breathing room.
  const COVER_FOOTER_SEP_Y = 686;
  // Requested: bottom separator line should not span full border width.
  const FOOTER_LINE_INSET_FROM_BORDER = 36;
  // Keep page number clearly below the gray separator line.
  const PAGE_NUMBER_GAP_FROM_LINE = 14;
  const LIST_INDENT = 14;
  const COVER_COMPANY_ADDRESS_LINE_1 = "800 North Mary Street,";
  const COVER_COMPANY_ADDRESS_LINE_2 = "Tempe, Arizona, 85822";

  const gcName = (doc.gcName ?? "").trim() || "the General Contractor";
  const partnerName = gcName;
  const projectName = (doc.projectName ?? "").trim();
  const jobNumber = (doc.jobNumber ?? "").trim();

  const coverDate = formatCoverDateUpper(doc.date);
  const coverAddress = formatCoverAddress(doc.projectAddress);

  const scopeItems = scopeItemsOrFallback(doc);
  const scopeBlob = scopeBlobForHeuristics(scopeItems);
  const explicitSections = normalizeExplicitSections(doc.sections);

  const includesWaterTruck = explicitSections
    ? explicitSections.has("water-truck")
    : resolveSectionVisibility(
        doc.includeWaterTruckSection,
        scopeBlob.includes("water truck")
      );
  const includesStreetSweeping = explicitSections
    ? explicitSections.has("street-sweeping")
    : resolveSectionVisibility(
        doc.includeStreetSweepingSection,
        scopeBlob.includes("street sweeping") ||
          // be conservative; plain "sweeping" could show up in scope details.
          (scopeBlob.includes("sweep") && !scopeBlob.includes("swept"))
      );
  const includesPortableSanitation = explicitSections
    ? explicitSections.has("portable-sanitation")
    : resolveSectionVisibility(
        doc.includePortableSanitationSection,
        scopeBlob.includes("portable") ||
          scopeBlob.includes("sanitation") ||
          scopeBlob.includes("toilet")
      );

  const content: Content[] = [
    // Cover page
    {
      stack: [
        {
          image: logoBase64,
          fit: [380, 110],
          alignment: "center",
          margin: [0, 34, 0, 0],
        },
        {
          // Requested: right-justified block, low on the page, 0.5" from border-safe right edge.
          absolutePosition: { x: CONTENT_MARGIN_X, y: FOOTER_SEP_Y - 72 - 96 },
          columns: [
            {
              width: PAGE_W - CONTENT_MARGIN_X * 2,
              alignment: "right",
              stack: [
                {
                  text: "Site Specific Safety Plan",
                  bold: true,
                  fontSize: 14,
                  margin: [0, 0, 0, 4],
                },
                {
                  text: [
                    { text: "Project: ", bold: true },
                    { text: projectName },
                  ],
                  fontSize: 12,
                  margin: [0, 0, 0, 2],
                },
                {
                  text: [
                    { text: "Contractor: ", bold: true },
                    { text: (doc.gcName ?? "").trim() },
                  ],
                  fontSize: 12,
                  margin: [0, 0, 0, 2],
                },
                ...(coverDate
                  ? [
                      {
                        text: [
                          { text: "Date: ", bold: true },
                          { text: coverDate },
                        ],
                        fontSize: 12,
                        margin: [0, 0, 0, 2],
                      } as Content,
                    ]
                  : []),
                {
                  text: [
                    { text: "Address: ", bold: true },
                    { text: coverAddress },
                  ],
                  fontSize: 12,
                  margin: [0, 0, 0, 2],
                },
                ...(jobNumber
                  ? [
                      {
                        text: [
                          { text: "Job Number: ", bold: true },
                          { text: jobNumber },
                        ],
                        fontSize: 12,
                        margin: [0, 0, 0, 0],
                      } as Content,
                    ]
                  : []),
              ],
            },
          ],
        },
      ],
      pageBreak: "after",
    },

    // 1) Emergency contacts
    pageTitle("Emergency Contact List - Desert Services"),
    paragraph(
      "The following emergency and project contacts are designated for routine coordination, urgent safety communication, and immediate incident escalation while work is active on site.",
      8
    ),
    { text: "", margin: [0, 8, 0, 0] },
    emergencyContactsTable(doc),
    { text: "", pageBreak: "after" },

    // 2) Commitment to safety
    pageTitle("Commitment to Safety - Desert Services"),
    paragraph(
      "At Desert Services, the safety of our employees, clients, and the communities we serve is our highest priority. We are committed to maintaining a proactive and compliant safety culture that aligns with OSHA standards, general contractor expectations, and industry best practices.",
      10
    ),
    paragraph(
      "We recognize that our work on active construction sites presents unique jobsite risks. Our leadership team takes a hands-on approach to identify hazards, implement effective controls, and ensure every employee is equipped with the training, tools, and knowledge needed to perform their work safely.",
      10
    ),
    paragraph(
      "We empower every team member with Stop Work Authority and support a culture of accountability, where safety is everyone\u2019s responsibility\u2014from the field to the front office.",
      10
    ),
    paragraph(
      "We believe that every incident is preventable, and through daily vigilance, open communication, and continuous improvement, we will achieve our goal of zero injuries.",
      10
    ),
    paragraph(
      `Desert Services is proud to partner with ${partnerName} in delivering jobsite support services with professionalism, reliability, and an unwavering commitment to safety.`,
      10
    ),
    { text: "\u2014 Desert Services Management Team", margin: [0, 6, 0, 0] },
    { text: "", pageBreak: "after" },

    // 3) Scope of work
    pageTitle("Scope of Work - Desert Services"),
    paragraph(
      `Desert Services is contracted to perform site support services at the direction of ${gcName}. Our scope of work includes critical temporary infrastructure services that support site cleanliness, access control, and environmental compliance throughout the duration of the project.`,
      10
    ),
    paragraph("The scope of Desert Services includes the following:", 4),
    // Flatten scope so we don't show subheadings like "SWPPP Services:" (per request).
    {
      ul: scopeItems.flatMap((item) =>
        item.details.map((d) => d.trim()).filter(Boolean)
      ),
      margin: [LIST_INDENT, 0, 0, 10],
    },
    paragraph(
      "All tasks will be performed by trained Desert Services personnel in accordance with OSHA regulations, company policies, and site-specific safety requirements. Pre-task planning and hazard controls will be reviewed daily with field crews.",
      0
    ),
    { text: "", pageBreak: "after" },

    // 4-5) Hazards + controls (split across two pages, matching the example structure)
    pageTitle("Hazard Identification and Control Measures"),
    paragraph(
      "Desert Services performs multiple support services across the construction site, each with its own unique hazards. To ensure a safe work environment, all hazards are identified through Job Hazard Analyses (JHAs), pre-task planning, and daily crew safety meetings.",
      10
    ),
    paragraph(
      "Control measures are implemented using the Hierarchy of Controls: elimination, substitution, engineering controls, administrative controls, and personal protective equipment (PPE).",
      12
    ),
    ...(includesWaterTruck
      ? ([
          { text: "Water Truck Operations", bold: true, margin: [0, 0, 0, 6] },
          label("Hazards:"),
          {
            ul: [
              "Slips and falls on wet surfaces",
              "Struck-by heavy equipment",
              "Limited visibility",
              "Rollover risk on uneven ground",
            ],
            margin: [LIST_INDENT, 0, 0, 6],
          },
          label("Controls:"),
          {
            ul: [
              "Use backup alarms and spotters",
              "Perform daily inspection of tires, brakes, and spray system",
              "Maintain safe speeds on uneven terrain",
              "Operator training and valid driver certification",
            ],
            margin: [LIST_INDENT, 0, 0, 10],
          },
        ] satisfies Content[])
      : ([] satisfies Content[])),
    { text: "SWPPP & Inspections", bold: true, margin: [0, 0, 0, 6] },
    label("Hazards:"),
    {
      ul: [
        "Slips and trips from erosion or standing water",
        "Struck-by incidents during BMP installation",
        "Exposure to contaminated runoff",
        "Manual handling of wattles / filter sock / silt fence materials",
        "Heat stress during outdoor installation and inspections",
      ],
      margin: [LIST_INDENT, 0, 0, 6],
    },
    label("Controls:"),
    {
      ul: [
        "Install BMPs (filter sock/wattles, inlet protection) per manufacturer and permit specifications",
        "Use proper lifting techniques or team lifts when handling materials",
        "Wear gloves, eye protection, and high-visibility PPE during installation and inspection",
        "Maintain stable footing by grading/leveling areas before BMP placement",
        "Conduct inspections per regulatory schedule (e.g., bi-weekly) and after qualifying rain events",
        "Remove/replace damaged or ineffective BMPs promptly to maintain compliance",
        "Use heat illness prevention measures (hydration, rest breaks, shade) as conditions require",
      ],
      margin: [LIST_INDENT, 0, 0, 0],
    },
    { text: "", pageBreak: "after" },

    ...(includesStreetSweeping
      ? ([
          { text: "Street Sweeping", bold: true, margin: [0, 0, 0, 6] },
          label("Hazards:"),
          {
            ul: [
              "Dust inhalation",
              "Struck-by traffic",
              "Flying debris",
              "Equipment failure",
            ],
            margin: [LIST_INDENT, 0, 0, 6],
          },
          label("Controls:"),
          {
            ul: [
              "Use dust suppression where applicable",
              "High-visibility PPE and traffic signage",
              "Equipment inspections and maintenance",
              "Use respiratory protection if dust levels exceed threshold limits",
            ],
            margin: [LIST_INDENT, 0, 0, 10],
          },
        ] satisfies Content[])
      : ([] satisfies Content[])),
    pageTitle("General Controls Across All Tasks"),
    paragraph(
      "The following controls apply to all Desert Services activities on this project and establish the baseline expectations for planning, PPE, communication, and incident prevention.",
      8
    ),
    {
      ul: [
        "Daily pre-task safety meetings with JHA review",
        "Site-specific PPE enforcement",
        `Coordination with ${gcName} site superintendent`,
        "Toolbox talks to address emerging hazards",
        "Immediate incident reporting and corrective action review",
      ],
      margin: [LIST_INDENT, 0, 0, 0],
    },
    { text: "", pageBreak: "after" },

    // 6) PPE
    pageTitle("Personal Protective Equipment (PPE)"),
    paragraph(
      "Desert Services requires all personnel to wear appropriate personal protective equipment (PPE) to reduce the risk of injury and ensure compliance with OSHA and site-specific safety protocols. PPE must be worn at all times while on the project site. Supervisors will ensure that workers are trained in the correct use and maintenance of their PPE.",
      12
    ),
    label("Minimum Required PPE for All Desert Services Personnel:"),
    {
      ul: [
        "Hard Hat - ANSI Z89.1 compliant; required at all active construction sites",
        "Safety Glasses - ANSI Z87.1 rated; must be worn at all times on site",
        "High-Visibility Safety Vest - Class II or higher; required when outside a vehicle or working around equipment",
        "Work Gloves - Must be worn when handling materials or performing physical labor",
        "Closed-Toe Shoes - Required at all times; task-specific jobs may require steel/composite toe boots depending on the work being performed",
      ],
      margin: [LIST_INDENT, 0, 0, 10],
    },
    label("PPE Maintenance and Storage:"),
    {
      ul: [
        "All PPE must be inspected daily before use",
        "Damaged, worn, or defective PPE must be replaced immediately",
        "Desert Services will provide PPE to employees at no cost",
        "PPE must be stored in a clean, dry location when not in use",
      ],
      margin: [LIST_INDENT, 0, 0, 10],
    },
    label("PPE Training and Enforcement:"),
    {
      ul: [
        "All employees are trained on PPE requirements as part of orientation and ongoing safety meetings",
        "Supervisors are responsible for ensuring compliance and documenting any violations",
        "Non-compliance with PPE policies may result in disciplinary action and/or removal from the jobsite",
      ],
      margin: [LIST_INDENT, 0, 0, 0],
    },
    { text: "", pageBreak: "after" },

    // 7) Incident reporting
    pageTitle("Incident Reporting and Investigation"),
    paragraph(
      "Desert Services is committed to prompt and accurate reporting of all incidents, including injuries, near misses, property damage, environmental releases, and safety violations. Early reporting enables timely medical care, effective root cause analysis, and corrective actions to prevent recurrence.",
      12
    ),
    label("Immediate Notification Requirements:"),
    {
      ul: [
        "All incidents must be reported immediately to the Desert Services Supervisor.",
        `The ${gcName} Site Superintendent must be notified of any incidents occurring on their project.`,
        "Emergency response (911) must be contacted for any life-threatening injuries.",
      ],
      margin: [LIST_INDENT, 0, 0, 10],
    },
    label("Types of Reportable Incidents:"),
    {
      ul: [
        "Occupational injuries or illnesses (regardless of severity)",
        "Near misses with the potential for serious injury or damage",
        "Property damage involving company equipment, vehicles, or third parties",
        "Chemical spills, biohazard exposures, or environmental releases",
        "Safety policy violations or Stop Work interventions",
      ],
      margin: [LIST_INDENT, 0, 0, 10],
    },
    label("Response and Documentation Process:"),
    {
      ol: [
        "Ensure the scene is safe and that injured individuals receive prompt medical attention.",
        `Notify Desert Services management and the ${gcName} Superintendent.`,
        "Secure the scene and gather relevant evidence (photos, witness statements, conditions).",
        "Complete the Desert Services Incident Report Form within 24 hours.",
        "Conduct a root cause analysis and determine corrective actions.",
        "Share findings and lessons learned during tailgate or safety meetings.",
      ],
      margin: [LIST_INDENT, 0, 0, 10],
    },
    label("Post-Incident Requirements:"),
    {
      ul: [
        "Injured employees may be subject to drug and alcohol screening in accordance with company policy.",
        "The Safety Manager will determine if an OSHA report is required (e.g., hospitalization, amputation, or fatality).",
        "All incidents are logged and tracked by Desert Services for internal review and trending.",
      ],
      margin: [LIST_INDENT, 0, 0, 0],
    },
    { text: "", pageBreak: "after" },

    // 8) Traffic control
    pageTitle("Traffic Control and Equipment Movement"),
    paragraph(
      "Desert Services operates service vehicles and equipment on active construction sites. To prevent struck-by incidents, vehicle collisions, and site congestion, all vehicle and equipment operations must follow established traffic control procedures in coordination with the General Contractor.",
      12
    ),
    label("General Requirements:"),
    {
      ul: [
        "All Desert Services drivers must hold a valid license and receive site-specific orientation prior to operating on site.",
        "Vehicles must enter and exit the site only at designated access points approved by the General Contractor.",
        "Posted speed limits must be obeyed at all times (maximum 5 mph when inside the construction zone unless otherwise posted).",
        "Drivers must yield to pedestrians and give right-of-way to mobile equipment and active construction crews.",
      ],
      margin: [LIST_INDENT, 0, 0, 10],
    },
    label("Spotter and Backing Requirements:"),
    {
      ul: [
        "A spotter must be used any time a vehicle is backing up where pedestrians, other vehicles, or structures may be in the path.",
        "Spotters must maintain constant visual contact with the driver and use agreed-upon hand signals or radios.",
        "If no spotter is available, the driver must dismount and inspect the backing path before proceeding.",
      ],
      margin: [LIST_INDENT, 0, 0, 10],
    },
    label("Staging and Drop Zones:"),
    {
      ul: [
        "Deliveries and staging must occur only in pre-approved staging zones.",
        "Ensure delivery/work areas are clear, level, and free of overhead hazards.",
        "Use cones, barricades, or signage to isolate work zones during loading/unloading or BMP installation activities.",
      ],
      margin: [LIST_INDENT, 0, 0, 10],
    },
    label("Traffic Control Devices:"),
    {
      ul: [
        "Use cones, caution tape, barricades, and signage when performing work in high-traffic or shared-use areas.",
        "\u201cWork Area Ahead,\u201d \u201cSlow - Truck Crossing,\u201d or \u201cFlagger Ahead\u201d signs must be used where applicable.",
        "Traffic control devices must comply with MUTCD requirements where public access is involved.",
      ],
      margin: [LIST_INDENT, 0, 0, 0],
    },
    { text: "", pageBreak: "after" },

    // 9) Coordination with GC
    pageTitle("Coordination with General Contractor"),
    paragraph(
      "Desert Services coordinates daily with the General Contractor to align access, scheduling, and site logistics before work begins and throughout active operations.",
      8
    ),
    {
      ul: [
        `Desert Services will coordinate vehicle access and schedule deliveries in accordance with ${gcName}\u2019s logistics plan.`,
        "Conflicts with crane picks, material deliveries, or structural work will be resolved by daily communication with site supervision.",
      ],
      margin: [LIST_INDENT, 0, 0, 10],
    },
    label("Equipment Inspections and Controls:"),
    {
      ul: [
        "All vehicles must undergo daily pre-trip inspections with documentation kept in the cab.",
        "Brakes, lights, horns, backup alarms, mirrors, and reflective markings must be in good working order.",
        "All loads must be properly secured before entering or exiting the site.",
      ],
      margin: [LIST_INDENT, 0, 0, 0],
    },
    { text: "", pageBreak: "after" },

    // 10) HazCom + SDS
    pageTitle("Hazard Communication and SDS Management"),
    paragraph(
      "Desert Services complies with OSHA\u2019s Hazard Communication Standard (29 CFR 1910.1200) by maintaining a written HAZCOM program, providing employee training, and ensuring that Safety Data Sheets (SDS) are available for all hazardous substances used during work activities.",
      12
    ),
    label("Chemical Products Covered:"),
    {
      ul: [
        ...(includesPortableSanitation
          ? ["Disinfectants used for portable sanitation servicing"]
          : []),
        "Fuels (gasoline and diesel) for equipment and vehicles",
        "Lubricants and cleaning agents used in equipment/vehicle maintenance",
        "Any additional products introduced per project needs",
      ],
      margin: [LIST_INDENT, 0, 0, 10],
    },
    label("Labeling Requirements:"),
    {
      ul: [
        "All chemical containers must display clear, GHS-compliant labeling with product name, hazard warnings, and manufacturer information.",
        "Secondary containers must also be labeled appropriately.",
        "Unlabeled or damaged containers are not permitted on site.",
      ],
      margin: [LIST_INDENT, 0, 0, 10],
    },
    label("Safety Data Sheets (SDS):"),
    {
      ul: [
        "SDS for all hazardous materials are stored digitally and accessible to Desert Services employees.",
        `A full SDS package will be provided to ${gcName} prior to the start of work and updated as needed.`,
        "SDS are reviewed before using any chemical product on site.",
        "Supervisors are responsible for ensuring that SDS records remain current and accurate.",
      ],
      margin: [LIST_INDENT, 0, 0, 10],
    },
    label("Employee Training:"),
    {
      ul: [
        "All employees receive HAZCOM training at the time of hire and during periodic safety meetings.",
        "Training includes how to read SDS documents, understand hazard pictograms, and respond to chemical exposure incidents.",
        "Additional training is provided when new hazardous materials are introduced to the job.",
      ],
      margin: [LIST_INDENT, 0, 0, 0],
    },
    { text: "", pageBreak: "after" },

    // 11) Spill + exposure response
    pageTitle("Spill and Exposure Response"),
    paragraph(
      "Desert Services follows a defined response protocol for chemical spills and employee exposure incidents, including immediate containment actions, escalation, and medical follow-up when required.",
      8
    ),
    {
      ul: [
        "Minor spills will be contained and cleaned using appropriate PPE and approved cleanup materials.",
        "Major spills or uncontrolled releases must be reported immediately to the Desert Services Supervisor and Safety Manager.",
        "Any employee exposed to a hazardous substance must report the incident and seek appropriate medical attention.",
      ],
      margin: [LIST_INDENT, 0, 0, 12],
    },
    label("Contractor Coordination:"),
    {
      ul: [
        `SDS for all chemicals used by Desert Services will be submitted to ${gcName}\u2019s site safety team prior to mobilization.`,
        "Any new products introduced after the start of the project will be accompanied by an updated SDS and notification to the General Contractor.",
      ],
      margin: [LIST_INDENT, 0, 0, 0],
    },
    { text: "", pageBreak: "after" },

    // 12) EAP
    pageTitle("Emergency Action Plan (EAP)"),
    paragraph(
      "Desert Services follows a structured Emergency Action Plan to respond quickly and effectively to incidents that may occur on a construction site. The goal is to ensure the safety of employees, notify the appropriate parties, and minimize disruption or escalation of hazardous situations.",
      12
    ),
    label("Types of Emergencies Covered:"),
    {
      ul: [
        "Medical emergencies",
        "Fire or explosion",
        "Hazardous material spills or exposure",
        "Utility damage (gas, water, electric)",
        "Natural disasters (e.g., extreme heat, high winds)",
        "Vehicle incidents or struck-by accidents",
      ],
      margin: [LIST_INDENT, 0, 0, 10],
    },
    label("Employee Responsibilities:"),
    {
      ul: [
        "Remain calm and alert.",
        "Report the emergency to the Desert Services Supervisor immediately.",
        "If life-threatening, dial 911 and provide clear details including location and nature of emergency.",
        "Evacuate the area if instructed or if conditions are unsafe.",
        "Render first aid only if properly trained and it is safe to do so.",
      ],
      margin: [LIST_INDENT, 0, 0, 10],
    },
    label("Emergency Contact Chain:"),
    {
      ul: [
        "Desert Services Supervisor",
        "Desert Services Safety Manager",
        `${gcName} Superintendent`,
        "Emergency medical services (911)",
        "Company office for internal notification and support",
      ],
      margin: [LIST_INDENT, 0, 0, 10],
    },
    label("Evacuation Procedures:"),
    {
      ul: [
        "Follow site-specific evacuation routes provided by the General Contractor.",
        "Meet at designated assembly points.",
        "Supervisors will account for all Desert Services employees and communicate status to the GC.",
      ],
      margin: [LIST_INDENT, 0, 0, 10],
    },
    label("Medical Emergencies:"),
    {
      ul: [
        "Call 911 for any serious injury or loss of consciousness.",
        "Provide care until emergency responders arrive.",
        "Notify Desert Services management and initiate incident reporting protocol.",
      ],
      margin: [LIST_INDENT, 0, 0, 0],
    },

    // Fire response (continues on same page in the sample)
    label("Fire Response"),
    {
      ul: [
        "Use a fire extinguisher only if the fire is small and you are trained to do so.",
        "Pull fire alarm or notify others nearby.",
        "Evacuate and remain clear of the hazard area.",
      ],
      margin: [LIST_INDENT, 0, 0, 12],
    },
    label("Spill or Exposure Response:"),
    {
      ul: [
        "Stop the source of the spill if safe.",
        "Use spill kits or absorbents for small releases.",
        "Evacuate and contact the Supervisor for large or uncontrolled releases.",
        "Any exposure to chemicals must be reported and followed by medical evaluation.",
      ],
      margin: [LIST_INDENT, 0, 0, 12],
    },
    label("Emergency Equipment:"),
    {
      ul: [
        "First aid kits are stocked and available in service vehicles.",
        "Fire extinguishers are located in service vehicles as applicable.",
        ...(includesPortableSanitation
          ? [
              "Spill kits are provided for field operations including portable sanitation servicing where applicable.",
            ]
          : ["Spill kits are provided for field operations where applicable."]),
      ],
      margin: [LIST_INDENT, 0, 0, 8],
    },
    label("Training:"),
    {
      ul: [
        "Employees are trained on emergency procedures during onboarding and through periodic safety meetings.",
        "EAP protocols are reviewed anytime a new risk is introduced or site conditions change.",
      ],
      margin: [LIST_INDENT, 0, 0, 0],
    },

    // Final blank page (the PHX07 example ends with a blank numbered page)
    { text: "" },
  ];

  return {
    pageSize: "LETTER",
    // Margins match the PHX07 Word template feel and leave room for logo header + footer separator.
    pageMargins: [CONTENT_MARGIN_X, 146, CONTENT_MARGIN_X, 90],
    defaultStyle: {
      fontSize: 9.5,
      color: COLORS.foreground,
      font: FONT_BODY,
    },
    content,
    background: (currentPage: number) => {
      const sepY = currentPage === 1 ? COVER_FOOTER_SEP_Y : FOOTER_SEP_Y;
      const baseCanvas: Content = {
        canvas: [
          // Outer border
          {
            type: "rect",
            x: BORDER_INSET,
            y: BORDER_INSET,
            w: PAGE_W - BORDER_INSET * 2,
            h: PAGE_H - BORDER_INSET * 2,
            lineWidth: 1,
            lineColor: "#000000",
          },
          // Footer separator line
          {
            type: "line",
            x1: BORDER_INSET + FOOTER_LINE_INSET_FROM_BORDER,
            y1: sepY,
            x2: PAGE_W - BORDER_INSET - FOOTER_LINE_INSET_FROM_BORDER,
            y2: sepY,
            lineWidth: 1,
            lineColor: "#D9D9D9",
          },
        ],
      };

      if (currentPage !== 1) {
        return baseCanvas;
      }

      const COVER_BAND_TOP_GAP = 18;
      const coverBandTopY = COVER_FOOTER_SEP_Y + COVER_BAND_TOP_GAP;
      const coverBandTable: Content = {
        absolutePosition: { x: CONTENT_MARGIN_X, y: coverBandTopY },
        table: {
          // Exactly matches content box width (PAGE_W - 2 * CONTENT_MARGIN_X = 468).
          widths: [260, 38, 154],
          body: [
            [
              {
                stack: [
                  {
                    text: "Desert Services LLC",
                    bold: true,
                    fontSize: 10,
                    margin: [0, 0, 0, 2],
                  },
                  { text: COVER_COMPANY_ADDRESS_LINE_1, fontSize: 10 },
                  { text: COVER_COMPANY_ADDRESS_LINE_2, fontSize: 10 },
                ],
                border: [false, false, false, false],
              },
              { text: "", border: [false, false, false, false] },
              {
                stack: [
                  {
                    text: `Phone: ${COMPANY.phone}`,
                    alignment: "right",
                    fontSize: 10,
                  },
                  {
                    text: `ROC: ${COMPANY.roc}`,
                    alignment: "right",
                    fontSize: 10,
                  },
                  {
                    text: `www.${COMPANY.website}`,
                    alignment: "right",
                    fontSize: 10,
                  },
                ],
                border: [false, false, false, false],
              },
            ],
          ],
        },
        layout: "noBorders",
      };

      return [baseCanvas, coverBandTable];
    },
    header: (currentPage: number) => {
      // Cover page uses a custom centered logo.
      if (currentPage === 1) {
        return { text: "" };
      }
      return {
        columns: [
          {
            image: logoBase64,
            fit: [210, 60],
          },
        ],
        margin: [
          CONTENT_MARGIN_X,
          BORDER_INSET + CONTENT_INSET_FROM_BORDER,
          CONTENT_MARGIN_X,
          0,
        ],
      };
    },
    footer: (currentPage: number) => {
      // Hide footer on cover; subsequent pages count from 1 (like the example).
      if (currentPage === 1) {
        return { text: "" };
      }
      const n = currentPage - 1;
      return {
        columns: [
          { text: "" },
          {
            text: [
              { text: `${n} | `, color: "#8A8A8A" },
              { text: "P a g e", color: "#C7C7C7" },
            ],
            alignment: "right" as const,
            fontSize: 11,
          },
        ],
        margin: [
          CONTENT_MARGIN_X,
          PAGE_NUMBER_GAP_FROM_LINE,
          CONTENT_MARGIN_X,
          BORDER_INSET - 6,
        ],
      };
    },
  };
}
