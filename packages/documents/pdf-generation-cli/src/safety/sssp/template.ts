import type { SsspDocument } from "@documents/pdf/sssp/types";

export function templateDoc(): SsspDocument {
  return {
    addressFor911: "",
    approvedBy: "____________________________",
    baselinePpe: [
      "Hard hat",
      "Hi-vis",
      "Safety glasses",
      "Gloves",
      "Work boots",
    ],
    contacts: [
      {
        role: "Project Manager",
        name: "____________________________",
        phone: "____________________________",
        email: "____________________________",
        notes: "Primary contact for all project-related issues",
      },
      {
        role: "Field Supervisor",
        name: "____________________________",
        phone: "____________________________",
        email: "____________________________",
        notes: "On-site supervisor for daily operations",
      },
      {
        role: "Safety Manager",
        name: "____________________________",
        phone: "____________________________",
        email: "____________________________",
        notes: "Contact for incidents, hazards, or violations",
      },
      {
        role: "Dispatcher / Coordinator",
        name: "____________________________",
        phone: "____________________________",
        email: "____________________________",
        notes: "For scheduling and equipment coordination",
      },
      {
        role: "Company Office (Main)",
        name: "Desert Services HQ",
        phone: "480-513-8986",
        email: "",
        notes: "General business and emergency support",
      },
    ],
    crewSize: "",

    dailyJhaRequired: "unknown",
    date: new Date().toISOString().slice(0, 10),
    duration: "",
    equipment: [],
    gateEscortRules: "",
    gcName: "____________________________",
    hazardsAndControls: [
      { hazard: "Site traffic / backing vehicles", controls: [] },
      { hazard: "Heat illness", controls: [] },
      { hazard: "Silica / dust exposure", controls: [] },
      { hazard: "Fall hazards (6ft+)", controls: [] },
      { hazard: "Electrical", controls: [] },
      { hazard: "Other (site-specific)", controls: [] },
    ],
    hospitalDirections: "",
    incidentReportingChain: "",

    jhaSubmission: "",
    jobNumber: "",
    musterPoint: "",
    nearestHospital: "",
    ownerName: "",
    parkingDeliveryRules: "",

    preparedBy: "____________________________",
    projectAddress: "____________________________",
    projectCode: "",
    projectName: "____________________________",
    projectSpecificPpe: [],

    reportingRequirements: "",
    requiredPermits: [],
    requiredPlansOrPrograms: [],
    respiratoryDetails: "",

    respiratoryRequired: "unknown",

    restrictedAreas: "",
    revision: "0",

    scopeItems: [
      {
        title: "SWPPP Services",
        details: ["____________________________"],
      },
    ],
    scopeOfWork: "",
    sections: [],
    signatures: [
      { label: "Desert Services Representative", who: "" },
      { label: "GC / Site Safety (Optional)", who: "" },
    ],

    siteAccessProcess: "",
    startDate: "",
    subcontractors: [],
    title: "Site Specific Safety Plan",
    toolboxTalkFrequency: "",

    trainingRequirements: [],
    workHours: "",
  };
}
