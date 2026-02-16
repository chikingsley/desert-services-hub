import type { Content } from "pdfmake/interfaces";
import {
  label,
  pageTitle,
  paragraph,
  type SsspBodyContext,
} from "./sssp-content-helpers";

export function buildSsspSecondaryBodyContent(
  context: SsspBodyContext
): Content[] {
  const { gcName, includesPortableSanitation, listIndent } = context;

  return [
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
      margin: [listIndent, 0, 0, 10],
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
      margin: [listIndent, 0, 0, 10],
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
      margin: [listIndent, 0, 0, 10],
    },
    label("Post-Incident Requirements:"),
    {
      ul: [
        "Injured employees may be subject to drug and alcohol screening in accordance with company policy.",
        "The Safety Manager will determine if an OSHA report is required (e.g., hospitalization, amputation, or fatality).",
        "All incidents are logged and tracked by Desert Services for internal review and trending.",
      ],
      margin: [listIndent, 0, 0, 0],
    },
    { text: "", pageBreak: "after" },

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
      margin: [listIndent, 0, 0, 10],
    },
    label("Spotter and Backing Requirements:"),
    {
      ul: [
        "A spotter must be used any time a vehicle is backing up where pedestrians, other vehicles, or structures may be in the path.",
        "Spotters must maintain constant visual contact with the driver and use agreed-upon hand signals or radios.",
        "If no spotter is available, the driver must dismount and inspect the backing path before proceeding.",
      ],
      margin: [listIndent, 0, 0, 10],
    },
    label("Staging and Drop Zones:"),
    {
      ul: [
        "Deliveries and staging must occur only in pre-approved staging zones.",
        "Ensure delivery/work areas are clear, level, and free of overhead hazards.",
        "Use cones, barricades, or signage to isolate work zones during loading/unloading or BMP installation activities.",
      ],
      margin: [listIndent, 0, 0, 10],
    },
    label("Traffic Control Devices:"),
    {
      ul: [
        "Use cones, caution tape, barricades, and signage when performing work in high-traffic or shared-use areas.",
        "“Work Area Ahead,” “Slow - Truck Crossing,” or “Flagger Ahead” signs must be used where applicable.",
        "Traffic control devices must comply with MUTCD requirements where public access is involved.",
      ],
      margin: [listIndent, 0, 0, 0],
    },
    { text: "", pageBreak: "after" },

    pageTitle("Coordination with General Contractor"),
    paragraph(
      "Desert Services coordinates daily with the General Contractor to align access, scheduling, and site logistics before work begins and throughout active operations.",
      8
    ),
    {
      ul: [
        `Desert Services will coordinate vehicle access and schedule deliveries in accordance with ${gcName}’s logistics plan.`,
        "Conflicts with crane picks, material deliveries, or structural work will be resolved by daily communication with site supervision.",
      ],
      margin: [listIndent, 0, 0, 10],
    },
    label("Equipment Inspections and Controls:"),
    {
      ul: [
        "All vehicles must undergo daily pre-trip inspections with documentation kept in the cab.",
        "Brakes, lights, horns, backup alarms, mirrors, and reflective markings must be in good working order.",
        "All loads must be properly secured before entering or exiting the site.",
      ],
      margin: [listIndent, 0, 0, 0],
    },
    { text: "", pageBreak: "after" },

    pageTitle("Hazard Communication and SDS Management"),
    paragraph(
      "Desert Services complies with OSHA’s Hazard Communication Standard (29 CFR 1910.1200) by maintaining a written HAZCOM program, providing employee training, and ensuring that Safety Data Sheets (SDS) are available for all hazardous substances used during work activities.",
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
      margin: [listIndent, 0, 0, 10],
    },
    label("Labeling Requirements:"),
    {
      ul: [
        "All chemical containers must display clear, GHS-compliant labeling with product name, hazard warnings, and manufacturer information.",
        "Secondary containers must also be labeled appropriately.",
        "Unlabeled or damaged containers are not permitted on site.",
      ],
      margin: [listIndent, 0, 0, 10],
    },
    label("Safety Data Sheets (SDS):"),
    {
      ul: [
        "SDS for all hazardous materials are stored digitally and accessible to Desert Services employees.",
        `A full SDS package will be provided to ${gcName} prior to the start of work and updated as needed.`,
        "SDS are reviewed before using any chemical product on site.",
        "Supervisors are responsible for ensuring that SDS records remain current and accurate.",
      ],
      margin: [listIndent, 0, 0, 10],
    },
    label("Employee Training:"),
    {
      ul: [
        "All employees receive HAZCOM training at the time of hire and during periodic safety meetings.",
        "Training includes how to read SDS documents, understand hazard pictograms, and respond to chemical exposure incidents.",
        "Additional training is provided when new hazardous materials are introduced to the job.",
      ],
      margin: [listIndent, 0, 0, 0],
    },
    { text: "", pageBreak: "after" },

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
      margin: [listIndent, 0, 0, 12],
    },
    label("Contractor Coordination:"),
    {
      ul: [
        `SDS for all chemicals used by Desert Services will be submitted to ${gcName}’s site safety team prior to mobilization.`,
        "Any new products introduced after the start of the project will be accompanied by an updated SDS and notification to the General Contractor.",
      ],
      margin: [listIndent, 0, 0, 0],
    },
    { text: "", pageBreak: "after" },

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
      margin: [listIndent, 0, 0, 10],
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
      margin: [listIndent, 0, 0, 10],
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
      margin: [listIndent, 0, 0, 10],
    },
    label("Evacuation Procedures:"),
    {
      ul: [
        "Follow site-specific evacuation routes provided by the General Contractor.",
        "Meet at designated assembly points.",
        "Supervisors will account for all Desert Services employees and communicate status to the GC.",
      ],
      margin: [listIndent, 0, 0, 10],
    },
    label("Medical Emergencies:"),
    {
      ul: [
        "Call 911 for any serious injury or loss of consciousness.",
        "Provide care until emergency responders arrive.",
        "Notify Desert Services management and initiate incident reporting protocol.",
      ],
      margin: [listIndent, 0, 0, 0],
    },

    label("Fire Response"),
    {
      ul: [
        "Use a fire extinguisher only if the fire is small and you are trained to do so.",
        "Pull fire alarm or notify others nearby.",
        "Evacuate and remain clear of the hazard area.",
      ],
      margin: [listIndent, 0, 0, 12],
    },
    label("Spill or Exposure Response:"),
    {
      ul: [
        "Stop the source of the spill if safe.",
        "Use spill kits or absorbents for small releases.",
        "Evacuate and contact the Supervisor for large or uncontrolled releases.",
        "Any exposure to chemicals must be reported and followed by medical evaluation.",
      ],
      margin: [listIndent, 0, 0, 12],
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
      margin: [listIndent, 0, 0, 8],
    },
    label("Training:"),
    {
      ul: [
        "Employees are trained on emergency procedures during onboarding and through periodic safety meetings.",
        "EAP protocols are reviewed anytime a new risk is introduced or site conditions change.",
      ],
      margin: [listIndent, 0, 0, 0],
    },

    { text: "" },
  ];
}
