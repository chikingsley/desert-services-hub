import type { Content } from "pdfmake/interfaces";
import {
  emergencyContactsTable,
  label,
  pageTitle,
  paragraph,
  type SsspBodyContext,
} from "./sssp-content-helpers";

export function buildSsspPrimaryBodyContent(
  context: SsspBodyContext
): Content[] {
  const {
    doc,
    gcName,
    partnerName,
    scopeItems,
    includesStreetSweeping,
    includesWaterTruck,
    listIndent,
  } = context;

  return [
    pageTitle("Emergency Contact List - Desert Services"),
    paragraph(
      "The following emergency and project contacts are designated for routine coordination, urgent safety communication, and immediate incident escalation while work is active on site.",
      8
    ),
    { text: "", margin: [0, 8, 0, 0] },
    emergencyContactsTable(doc),
    { text: "", pageBreak: "after" },

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
      "We empower every team member with Stop Work Authority and support a culture of accountability, where safety is everyone’s responsibility—from the field to the front office.",
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
    { text: "— Desert Services Management Team", margin: [0, 6, 0, 0] },
    { text: "", pageBreak: "after" },

    pageTitle("Scope of Work - Desert Services"),
    paragraph(
      `Desert Services is contracted to perform site support services at the direction of ${gcName}. Our scope of work includes critical temporary infrastructure services that support site cleanliness, access control, and environmental compliance throughout the duration of the project.`,
      10
    ),
    paragraph("The scope of Desert Services includes the following:", 4),
    {
      ul: scopeItems.flatMap((item) =>
        item.details.map((detail) => detail.trim()).filter(Boolean)
      ),
      margin: [listIndent, 0, 0, 10],
    },
    paragraph(
      "All tasks will be performed by trained Desert Services personnel in accordance with OSHA regulations, company policies, and site-specific safety requirements. Pre-task planning and hazard controls will be reviewed daily with field crews.",
      0
    ),
    { text: "", pageBreak: "after" },

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
            margin: [listIndent, 0, 0, 6],
          },
          label("Controls:"),
          {
            ul: [
              "Use backup alarms and spotters",
              "Perform daily inspection of tires, brakes, and spray system",
              "Maintain safe speeds on uneven terrain",
              "Operator training and valid driver certification",
            ],
            margin: [listIndent, 0, 0, 10],
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
      margin: [listIndent, 0, 0, 6],
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
      margin: [listIndent, 0, 0, 0],
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
            margin: [listIndent, 0, 0, 6],
          },
          label("Controls:"),
          {
            ul: [
              "Use dust suppression where applicable",
              "High-visibility PPE and traffic signage",
              "Equipment inspections and maintenance",
              "Use respiratory protection if dust levels exceed threshold limits",
            ],
            margin: [listIndent, 0, 0, 10],
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
      margin: [listIndent, 0, 0, 0],
    },
    { text: "", pageBreak: "after" },

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
      margin: [listIndent, 0, 0, 10],
    },
    label("PPE Maintenance and Storage:"),
    {
      ul: [
        "All PPE must be inspected daily before use",
        "Damaged, worn, or defective PPE must be replaced immediately",
        "Desert Services will provide PPE to employees at no cost",
        "PPE must be stored in a clean, dry location when not in use",
      ],
      margin: [listIndent, 0, 0, 10],
    },
    label("PPE Training and Enforcement:"),
    {
      ul: [
        "All employees are trained on PPE requirements as part of orientation and ongoing safety meetings",
        "Supervisors are responsible for ensuring compliance and documenting any violations",
        "Non-compliance with PPE policies may result in disciplinary action and/or removal from the jobsite",
      ],
      margin: [listIndent, 0, 0, 0],
    },
    { text: "", pageBreak: "after" },
  ];
}
