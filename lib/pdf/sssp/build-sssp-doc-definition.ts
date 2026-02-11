import type { Content, ContentTable, TDocumentDefinitions } from "pdfmake/interfaces";
import { borderedLayout } from "../shared/layouts";
import type { SsspDocument, SsspScopeItem } from "./types";

const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
] as const;

function formatCoverDateUpper(dateStr: string | undefined): string {
  const raw = (dateStr ?? "").trim();
  if (!raw) return "";

  // Treat yyyy-mm-dd as a *local* calendar date (Date("YYYY-MM-DD") is UTC and can shift a day in US timezones).
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw.toUpperCase();

  const month = MONTHS[d.getMonth()] ?? "";
  return `${month} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatCoverAddressUpper(address: string): string {
  const a = address.trim();
  if (!a) return "";
  const idx = a.indexOf(",");
  if (idx === -1) return a.toUpperCase();
  const street = a.slice(0, idx).trim();
  const rest = a.slice(idx + 1).trim();
  return `${street}; ${rest}`.toUpperCase();
}

function pageTitle(text: string): Content {
  return {
    text,
    bold: true,
    fontSize: 12,
    margin: [0, 0, 0, 8],
  };
}

function paragraph(text: string, marginBottom = 10): Content {
  return {
    text,
    margin: [0, 0, 0, marginBottom],
    lineHeight: 1.05,
  };
}

function bulletTitleLine(title: string): Content {
  return { text: `\u2022 ${title}`, margin: [0, 2, 0, 4] };
}

function scopeItemsOrFallback(doc: SsspDocument): SsspScopeItem[] {
  if (doc.scopeItems && doc.scopeItems.length > 0) return doc.scopeItems;
  const s = (doc.scopeOfWork ?? "").trim();
  if (!s) return [];
  return [{ title: "Scope of Work:", details: [s] }];
}

function emergencyContactsTable(doc: SsspDocument): ContentTable {
  const rows = (doc.contacts ?? []).map((c) => {
    const nameLines = [c.name?.trim(), c.email?.trim()].filter(Boolean).join("\n");
    return [
      { text: c.role ?? "", margin: [6, 6, 6, 6] },
      { text: nameLines || "", margin: [6, 6, 6, 6] },
      { text: (c.phone ?? "").trim(), margin: [6, 6, 6, 6] },
      { text: (c.notes ?? "").trim(), margin: [6, 6, 6, 6] },
    ];
  });

  return {
    table: {
      widths: [120, "*", 110, "*"],
      body: [
        [
          { text: "Role", bold: true, margin: [6, 6, 6, 6] },
          { text: "Contact Name", bold: true, margin: [6, 6, 6, 6] },
          { text: "Phone Number", bold: true, margin: [6, 6, 6, 6] },
          { text: "Notes", bold: true, margin: [6, 6, 6, 6] },
        ],
        ...(rows.length > 0
          ? rows
          : [
              [
                { text: "", margin: [6, 16, 6, 16] },
                { text: "", margin: [6, 16, 6, 16] },
                { text: "", margin: [6, 16, 6, 16] },
                { text: "", margin: [6, 16, 6, 16] },
              ],
            ]),
      ],
    },
    layout: borderedLayout,
  };
}

export function buildSsspDocDefinition(
  doc: SsspDocument,
  logoBase64: string
): TDocumentDefinitions {
  const gcName = (doc.gcName ?? "").trim() || "the General Contractor";
  const partnerName = gcName;
  const code =
    (doc.projectCode ?? "").trim() ||
    (doc.jobNumber ?? "").trim() ||
    (doc.projectName ?? "").trim();

  const coverDate = formatCoverDateUpper(doc.date);
  const coverAddress = formatCoverAddressUpper(doc.projectAddress);

  const scopeItems = scopeItemsOrFallback(doc);

  const content: Content[] = [
    // Cover page
    {
      stack: [
        { image: logoBase64, fit: [280, 78], alignment: "center", margin: [0, 18, 0, 48] },
        { text: coverDate, bold: true, alignment: "center", margin: [0, 0, 0, 18] },
        {
          text: "SITE SPECIFIC SAFETY PLAN",
          bold: true,
          fontSize: 20,
          alignment: "center",
          margin: [0, 0, 0, 14],
        },
        {
          text: code.toUpperCase(),
          bold: true,
          fontSize: 14,
          alignment: "center",
          margin: [0, 0, 0, 10],
        },
        { text: coverAddress, bold: true, alignment: "center" },
      ],
      pageBreak: "after",
    },

    // 1) Emergency contacts
    pageTitle("Emergency Contact List - Desert Services"),
    emergencyContactsTable(doc),
    { text: "", pageBreak: "after" },

    // 2) Commitment to safety
    pageTitle("Commitment to Safety - Desert Services"),
    paragraph(
      "At Desert Services, the safety of our employees, clients, and the communities we serve is our highest priority. We are committed to maintaining a proactive and compliant safety culture that aligns with OSHA standards, general contractor expectations, and industry best practices.",
      10
    ),
    paragraph(
      "We recognize that our services\u2014including roll-off dumpster operations, temporary fencing installation, and portable sanitation\u2014present unique jobsite risks. Our leadership team takes a hands-on approach to identify hazards, implement effective controls, and ensure every employee is equipped with the training, tools, and knowledge needed to perform their work safely.",
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
    paragraph("The scope of Desert Services includes the following:", 8),
    ...scopeItems.flatMap((item) => {
      const titleLine = bulletTitleLine(`${item.title.replace(/\\s*:\\s*$/, "")}:`);
      const detail = {
        text: item.details.join("\n"),
        margin: [18, 0, 0, 8],
        lineHeight: 1.15,
      } satisfies Content;
      return [titleLine, detail];
    }),
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
    { text: "Water Truck Operations", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 Hazards: Slips and falls on wet surfaces, struck-by heavy equipment, limited visibility, rollover risk on uneven ground.", margin: [0, 0, 0, 6] },
    { text: "\u2022 Controls:", margin: [0, 0, 0, 2] },
    { text: "o Use of backup alarms and spotters", margin: [18, 0, 0, 2] },
    { text: "o Daily inspection of tires, brakes, and spray system", margin: [18, 0, 0, 2] },
    { text: "o Safe speeds on uneven terrain", margin: [18, 0, 0, 2] },
    { text: "o Operator training and valid driver certification", margin: [18, 0, 0, 10] },
    { text: "SWPPP & Inspections", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 Hazards: Slips and trips from erosion or standing water, struck-by incidents during BMP installation, exposure to contaminated runoff, manual handling of wattles/silt fence, heat stress during outdoor inspections.", margin: [0, 0, 0, 6] },
    { text: "\u2022 Controls:", margin: [0, 0, 0, 2] },
    { text: "o Install BMPs (silt fence, wattles, inlet protection) per manufacturer and permit specifications.", margin: [18, 0, 0, 2] },
    { text: "o Use proper lifting techniques or team lifts when handling rolls of silt fence/wattles.", margin: [18, 0, 0, 2] },
    { text: "o Wear gloves, eye protection, and high-visibility vests during installation and inspection.", margin: [18, 0, 0, 2] },
    { text: "o Maintain stable footing by grading/leveling areas before BMP placement.", margin: [18, 0, 0, 2] },
    { text: "o Conduct inspections per regulatory schedule (typically every 7-14 days and after rain events).", margin: [18, 0, 0, 2] },
    { text: "o Remove and replace damaged or ineffective BMPs immediately to maintain compliance.", margin: [18, 0, 0, 2] },
    { text: "o Provide heat stress prevention measures (hydration, rest breaks, shade) for inspection staff.", margin: [18, 0, 0, 0] },
    { text: "", pageBreak: "after" },

    { text: "Street Sweeping", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 Hazards: Dust inhalation, struck-by traffic, flying debris, equipment failure.", margin: [0, 0, 0, 6] },
    { text: "\u2022 Controls:", margin: [0, 0, 0, 2] },
    { text: "o Use of dust suppression or water-injection systems", margin: [18, 0, 0, 2] },
    { text: "o High-visibility PPE and traffic signage", margin: [18, 0, 0, 2] },
    { text: "o Equipment inspections and maintenance", margin: [18, 0, 0, 2] },
    { text: "o Use of respiratory protection if dust levels exceed threshold limits", margin: [18, 0, 0, 10] },
    { text: "General Controls Across All Tasks", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 Daily pre-task safety meetings with JHA review", margin: [0, 0, 0, 2] },
    { text: "\u2022 Site-specific PPE enforcement", margin: [0, 0, 0, 2] },
    { text: `\u2022 Coordination with ${gcName} site superintendent`, margin: [0, 0, 0, 2] },
    { text: "\u2022 Use of tailgate talks to address emerging hazards", margin: [0, 0, 0, 2] },
    { text: "\u2022 Immediate incident reporting and corrective action review", margin: [0, 0, 0, 10] },
    paragraph(
      "Desert Services crews are trained to recognize changing site conditions and adjust control measures as needed to maintain a safe work environment.",
      0
    ),
    { text: "", pageBreak: "after" },

    // 6) PPE
    pageTitle("Personal Protective Equipment (PPE)"),
    paragraph(
      "Desert Services requires all personnel to wear appropriate personal protective equipment (PPE) to reduce the risk of injury and ensure compliance with OSHA and site-specific safety protocols. PPE must be worn at all times while on the project site. Supervisors will ensure that workers are trained in the correct use and maintenance of their PPE.",
      12
    ),
    { text: "Minimum Required PPE for All Desert Services Personnel:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 Hard Hat - ANSI Z89.1 compliant; required at all active construction sites", margin: [0, 0, 0, 4] },
    { text: "\u2022 Safety Glasses - ANSI Z87.1 rated; must be worn at all times on site", margin: [0, 0, 0, 4] },
    { text: "\u2022 High-Visibility Safety Vest - Class II or higher; required when outside a vehicle or working around equipment", margin: [0, 0, 0, 4] },
    { text: "\u2022 Work Gloves - Must be worn when handling materials or performing physical labor", margin: [0, 0, 0, 4] },
    { text: "\u2022 Closed-Toe Shoes - Required at all times; task-specific jobs may require steel/composite toe boots depending on the work being performed", margin: [0, 0, 0, 10] },
    { text: "PPE Maintenance and Storage:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 All PPE must be inspected daily before use", margin: [0, 0, 0, 4] },
    { text: "\u2022 Damaged, worn, or defective PPE must be replaced immediately", margin: [0, 0, 0, 4] },
    { text: "\u2022 Desert Services will provide PPE to employees at no cost", margin: [0, 0, 0, 4] },
    { text: "\u2022 PPE must be stored in a clean, dry location when not in use", margin: [0, 0, 0, 10] },
    { text: "PPE Training and Enforcement:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 All employees are trained on PPE requirements as part of orientation and ongoing safety meetings", margin: [0, 0, 0, 4] },
    { text: "\u2022 Supervisors are responsible for ensuring compliance and documenting any violations", margin: [0, 0, 0, 4] },
    { text: "\u2022 Non-compliance with PPE policies may result in disciplinary action and/or removal from the jobsite", margin: [0, 0, 0, 0] },
    { text: "", pageBreak: "after" },

    // 7) Incident reporting
    pageTitle("Incident Reporting and Investigation"),
    paragraph(
      "Desert Services is committed to prompt and accurate reporting of all incidents, including injuries, near misses, property damage, environmental releases, and safety violations. Early reporting enables timely medical care, effective root cause analysis, and corrective actions to prevent recurrence.",
      12
    ),
    { text: "Immediate Notification Requirements:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 All incidents must be reported immediately to the Desert Services Supervisor.", margin: [0, 0, 0, 4] },
    { text: `\u2022 The ${gcName} Site Superintendent must be notified of any incidents occurring on their project.`, margin: [0, 0, 0, 4] },
    { text: "\u2022 Emergency response (911) must be contacted for any life-threatening injuries.", margin: [0, 0, 0, 10] },
    { text: "Types of Reportable Incidents:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 Occupational injuries or illnesses (regardless of severity)", margin: [0, 0, 0, 4] },
    { text: "\u2022 Near misses with the potential for serious injury or damage", margin: [0, 0, 0, 4] },
    { text: "\u2022 Property damage involving company equipment, vehicles, or third parties", margin: [0, 0, 0, 4] },
    { text: "\u2022 Chemical spills, biohazard exposures, or environmental releases", margin: [0, 0, 0, 4] },
    { text: "\u2022 Safety policy violations or Stop Work interventions", margin: [0, 0, 0, 10] },
    { text: "Response and Documentation Process:", bold: true, margin: [0, 0, 0, 6] },
    { text: "1. Ensure the scene is safe and that injured individuals receive prompt medical attention.", margin: [0, 0, 0, 3] },
    { text: `2. Notify Desert Services management and the ${gcName} Superintendent.`, margin: [0, 0, 0, 3] },
    { text: "3. Secure the scene and gather relevant evidence (photos, witness statements, conditions).", margin: [0, 0, 0, 3] },
    { text: "4. Complete the Desert Services Incident Report Form within 24 hours.", margin: [0, 0, 0, 3] },
    { text: "5. Conduct a root cause analysis and determine corrective actions.", margin: [0, 0, 0, 3] },
    { text: "6. Share findings and lessons learned during tailgate or safety meetings.", margin: [0, 0, 0, 10] },
    { text: "Post-Incident Requirements:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 Injured employees may be subject to drug and alcohol screening in accordance with company policy.", margin: [0, 0, 0, 4] },
    { text: "\u2022 The Safety Manager will determine if an OSHA report is required (e.g., hospitalization, amputation, or fatality).", margin: [0, 0, 0, 4] },
    { text: "\u2022 All incidents are logged and tracked by Desert Services for internal review and trending.", margin: [0, 0, 0, 0] },
    { text: "", pageBreak: "after" },

    // 8) Traffic control
    pageTitle("Traffic Control and Equipment Movement"),
    paragraph(
      "Desert Services operates a fleet of service vehicles, roll-off trucks, fencing trailers, and sanitation trucks on active construction sites. To prevent struck-by incidents, vehicle collisions, and site congestion, all vehicle and equipment operations must follow established traffic control procedures in coordination with the General Contractor.",
      12
    ),
    { text: "General Requirements:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 All Desert Services drivers must hold a valid license and receive site-specific orientation prior to operating on site.", margin: [0, 0, 0, 4] },
    { text: "\u2022 Vehicles must enter and exit the site only at designated access points approved by the General Contractor.", margin: [0, 0, 0, 4] },
    { text: "\u2022 Posted speed limits must be obeyed at all times - maximum 5 mph when inside the construction zone.", margin: [0, 0, 0, 4] },
    { text: "\u2022 Drivers must yield to pedestrians and give right-of-way to mobile equipment and active construction crews.", margin: [0, 0, 0, 10] },
    { text: "Spotter and Backing Requirements:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 A spotter must be used any time a vehicle is backing up where pedestrians, other vehicles, or structures may be in the path.", margin: [0, 0, 0, 4] },
    { text: "\u2022 Spotters must maintain constant visual contact with the driver and use agreed-upon hand signals or radios.", margin: [0, 0, 0, 4] },
    { text: "\u2022 If no spotter is available, the driver must dismount and inspect the backing path before proceeding.", margin: [0, 0, 0, 10] },
    { text: "Staging and Drop Zones:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 Roll-off containers, fencing materials, and portable toilets must be delivered to pre-approved staging zones only.", margin: [0, 0, 0, 4] },
    { text: "\u2022 Drivers are responsible for ensuring that the delivery area is clear, level, and free of overhead hazards.", margin: [0, 0, 0, 4] },
    { text: "\u2022 Cones, barricades, or signage must be placed to isolate drop zones during loading/unloading.", margin: [0, 0, 0, 10] },
    { text: "Traffic Control Devices:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 Use of cones, caution tape, barricades, and signage is required when performing services in high-traffic or shared-use areas.", margin: [0, 0, 0, 4] },
    { text: "\u2022 \u201cWork Area Ahead,\u201d \u201cSlow - Truck Crossing,\u201d or \u201cFlagger Ahead\u201d signs must be used where applicable.", margin: [0, 0, 0, 4] },
    { text: "\u2022 All traffic control devices must comply with the Manual on Uniform Traffic Control Devices (MUTCD) where public access is involved.", margin: [0, 0, 0, 0] },
    { text: "", pageBreak: "after" },

    // 9) Coordination with GC
    pageTitle("Coordination with General Contractor:"),
    { text: `\u2022 Desert Services will coordinate vehicle access and schedule deliveries in accordance with ${gcName}\u2019s logistics plan.`, margin: [0, 0, 0, 4] },
    { text: "\u2022 Conflicts with crane picks, material deliveries, or structural work will be resolved by daily communication with site supervision.", margin: [0, 0, 0, 10] },
    { text: "Equipment Inspections and Controls:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 All vehicles must undergo daily pre-trip inspections with documentation kept in the cab.", margin: [0, 0, 0, 4] },
    { text: "\u2022 Brakes, lights, horns, backup alarms, mirrors, and reflective markings must be in good working order.", margin: [0, 0, 0, 4] },
    { text: "\u2022 All loads must be properly secured before entering or exiting the site.", margin: [0, 0, 0, 0] },
    { text: "", pageBreak: "after" },

    // 10) HazCom + SDS
    pageTitle("Hazard Communication and SDS Management"),
    paragraph(
      "Desert Services complies with OSHA\u2019s Hazard Communication Standard (29 CFR 1910.1200) by maintaining a written HAZCOM program, providing employee training, and ensuring that Safety Data Sheets (SDS) are available for all hazardous substances used during work activities.",
      12
    ),
    { text: "Chemical Products Covered:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 Disinfectants used for portable toilet servicing", margin: [0, 0, 0, 4] },
    { text: "\u2022 Fuels (gasoline and diesel) for equipment and vehicles", margin: [0, 0, 0, 4] },
    { text: "\u2022 Lubricants and cleaning agents used in fleet maintenance", margin: [0, 0, 0, 4] },
    { text: "\u2022 Any additional chemicals introduced per project needs", margin: [0, 0, 0, 10] },
    { text: "Labeling Requirements:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 All chemical containers must display clear, GHS-compliant labeling with product name, hazard warnings, and manufacturer information.", margin: [0, 0, 0, 4] },
    { text: "\u2022 Secondary containers must also be labeled appropriately.", margin: [0, 0, 0, 4] },
    { text: "\u2022 Unlabeled or damaged containers are not permitted on site.", margin: [0, 0, 0, 10] },
    { text: "Safety Data Sheets (SDS):", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 SDS for all hazardous materials are stored digitally and accessible to all Desert Services employees via mobile devices or cloud-based storage.", margin: [0, 0, 0, 4] },
    { text: `\u2022 A full SDS package will be provided to ${gcName} prior to the start of work and updated as needed.`, margin: [0, 0, 0, 4] },
    { text: "\u2022 SDS are reviewed before using any chemical product on site.", margin: [0, 0, 0, 4] },
    { text: "\u2022 Supervisors are responsible for ensuring that digital SDS records remain current and accurate.", margin: [0, 0, 0, 10] },
    { text: "Employee Training:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 All employees receive HAZCOM training at the time of hire and during periodic safety meetings.", margin: [0, 0, 0, 4] },
    { text: "\u2022 Training includes how to read SDS documents, understand hazard pictograms, and respond to chemical exposure incidents.", margin: [0, 0, 0, 4] },
    { text: "\u2022 Additional training is provided when new hazardous materials are introduced to the job.", margin: [0, 0, 0, 0] },
    { text: "", pageBreak: "after" },

    // 11) Spill + exposure response
    pageTitle("Spill and Exposure Response:"),
    { text: "\u2022 Minor spills will be contained and cleaned using appropriate PPE and approved cleanup materials.", margin: [0, 0, 0, 4] },
    { text: "\u2022 Major spills or uncontrolled releases must be reported immediately to the Desert Services Supervisor and Safety Manager.", margin: [0, 0, 0, 4] },
    { text: "\u2022 Any employee exposed to a hazardous substance must report the incident and seek appropriate medical attention.", margin: [0, 0, 0, 12] },
    { text: "Contractor Coordination:", bold: true, margin: [0, 0, 0, 6] },
    { text: `\u2022 SDS for all chemicals used by Desert Services will be submitted to ${gcName}\u2019s site safety team prior to mobilization.`, margin: [0, 0, 0, 4] },
    { text: "\u2022 Any new products introduced after the start of the project will be accompanied by an updated SDS and notification to the General Contractor.", margin: [0, 0, 0, 0] },
    { text: "", pageBreak: "after" },

    // 12) EAP
    pageTitle("Emergency Action Plan (EAP)"),
    paragraph(
      "Desert Services follows a structured Emergency Action Plan to respond quickly and effectively to incidents that may occur on a construction site. The goal is to ensure the safety of employees, notify the appropriate parties, and minimize disruption or escalation of hazardous situations.",
      12
    ),
    { text: "Types of Emergencies Covered:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 Medical emergencies", margin: [0, 0, 0, 3] },
    { text: "\u2022 Fire or explosion", margin: [0, 0, 0, 3] },
    { text: "\u2022 Hazardous material spills or exposure", margin: [0, 0, 0, 3] },
    { text: "\u2022 Utility damage (gas, water, electric)", margin: [0, 0, 0, 3] },
    { text: "\u2022 Natural disasters (e.g., extreme heat, high winds)", margin: [0, 0, 0, 3] },
    { text: "\u2022 Vehicle incidents or struck-by accidents", margin: [0, 0, 0, 10] },
    { text: "Employee Responsibilities:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 Remain calm and alert.", margin: [0, 0, 0, 3] },
    { text: "\u2022 Report the emergency to the Desert Services Supervisor immediately.", margin: [0, 0, 0, 3] },
    { text: "\u2022 If life-threatening, dial 911 and provide clear details including location and nature of emergency.", margin: [0, 0, 0, 3] },
    { text: "\u2022 Evacuate the area if instructed or if conditions are unsafe.", margin: [0, 0, 0, 3] },
    { text: "\u2022 Render first aid only if properly trained and it is safe to do so.", margin: [0, 0, 0, 10] },
    { text: "Emergency Contact Chain:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 Desert Services Supervisor", margin: [0, 0, 0, 3] },
    { text: "\u2022 Desert Services Safety Manager", margin: [0, 0, 0, 3] },
    { text: `\u2022 ${gcName} Superintendent`, margin: [0, 0, 0, 3] },
    { text: "\u2022 Emergency medical services (911)", margin: [0, 0, 0, 3] },
    { text: "\u2022 Company office for internal notification and support", margin: [0, 0, 0, 10] },
    { text: "Evacuation Procedures:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 Follow site-specific evacuation routes provided by the General Contractor.", margin: [0, 0, 0, 3] },
    { text: "\u2022 Meet at designated assembly points.", margin: [0, 0, 0, 3] },
    { text: "\u2022 Supervisors will account for all Desert Services employees and communicate status to the GC.", margin: [0, 0, 0, 10] },
    { text: "Medical Emergencies:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 Call 911 for any serious injury or loss of consciousness.", margin: [0, 0, 0, 3] },
    { text: "\u2022 Provide care until emergency responders arrive.", margin: [0, 0, 0, 3] },
    { text: "\u2022 Notify Desert Services management and initiate incident reporting protocol.", margin: [0, 0, 0, 0] },

    // Fire response (continues on same page in the sample)
    { text: "Fire Response:", bold: true, fontSize: 12, margin: [0, 8, 0, 8] },
    { text: "\u2022 Use a fire extinguisher only if the fire is small and you are trained to do so.", margin: [0, 0, 0, 4] },
    { text: "\u2022 Pull fire alarm or notify others nearby.", margin: [0, 0, 0, 4] },
    { text: "\u2022 Evacuate and remain clear of the hazard area.", margin: [0, 0, 0, 12] },
    { text: "Spill or Exposure Response:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 Stop the source of the spill if safe.", margin: [0, 0, 0, 4] },
    { text: "\u2022 Use spill kits or absorbents for small releases.", margin: [0, 0, 0, 4] },
    { text: "\u2022 Evacuate and contact the Supervisor for large or uncontrolled releases.", margin: [0, 0, 0, 4] },
    { text: "\u2022 Any exposure to chemicals must be reported and followed by medical evaluation.", margin: [0, 0, 0, 12] },
    { text: "Emergency Equipment:", bold: true, margin: [0, 0, 0, 6] },
    { text: "\u2022 First aid kits are stocked and available in service vehicles.", margin: [0, 0, 0, 2] },
    { text: "\u2022 Fire extinguishers are located in all active service vehicles.", margin: [0, 0, 0, 2] },
    { text: "\u2022 Spill kits are provided for sanitation and fueling operations.", margin: [0, 0, 0, 8] },
    { text: "Training:", bold: true, margin: [0, 0, 0, 2] },
    { text: "\u2022 Employees are trained on emergency procedures during onboarding and through periodic safety meetings.", margin: [0, 0, 0, 2] },
    { text: "\u2022 EAP protocols are reviewed anytime a new risk is introduced or site conditions change.", margin: [0, 0, 0, 0] },

    // Final blank page (the PHX07 example ends with a blank numbered page)
    { text: "" },
  ];

  return {
    pageSize: "LETTER",
    pageMargins: [50, 32, 50, 32],
    defaultStyle: {
      fontSize: 8.8,
      color: "#000",
    },
    content,
    footer: (currentPage: number) => {
      // Hide footer on cover; subsequent pages count from 1 (like the example).
      if (currentPage === 1) return { text: "" };
      return {
        text: `${currentPage - 1}|Page`,
        alignment: "right" as const,
        margin: [54, 0, 54, 0],
        fontSize: 10,
        color: "#000",
      };
    },
  };
}
