import type { SsspDocument } from "@lib/pdf/sssp/types";

export function templateDoc(): SsspDocument {
  return {
    title: "Site Specific Safety Plan",
    revision: "0",
    date: new Date().toISOString().slice(0, 10),
    preparedBy: "____________________________",
    approvedBy: "____________________________",

    projectName: "____________________________",
    projectAddress: "____________________________",
    projectCode: "",
    jobNumber: "",
    gcName: "____________________________",
    ownerName: "",
    startDate: "",
    duration: "",
    workHours: "",

    scopeOfWork: "",
    scopeItems: [
      {
        title: "SWPPP Services",
        details: ["____________________________"],
      },
    ],
    sections: [],
    crewSize: "",
    equipment: [],
    subcontractors: [],

    siteAccessProcess: "",
    gateEscortRules: "",
    parkingDeliveryRules: "",
    restrictedAreas: "",
    reportingRequirements: "",

    baselinePpe: [
      "Hard hat",
      "Hi-vis",
      "Safety glasses",
      "Gloves",
      "Work boots",
    ],
    projectSpecificPpe: [],
    respiratoryRequired: "unknown",
    respiratoryDetails: "",

    hazardsAndControls: [
      { hazard: "Site traffic / backing vehicles", controls: [] },
      { hazard: "Heat illness", controls: [] },
      { hazard: "Silica / dust exposure", controls: [] },
      { hazard: "Fall hazards (6ft+)", controls: [] },
      { hazard: "Electrical", controls: [] },
      { hazard: "Other (site-specific)", controls: [] },
    ],

    requiredPermits: [],
    requiredPlansOrPrograms: [],

    trainingRequirements: [],
    toolboxTalkFrequency: "",
    dailyJhaRequired: "unknown",
    jhaSubmission: "",

    addressFor911: "",
    musterPoint: "",
    nearestHospital: "",
    hospitalDirections: "",
    incidentReportingChain: "",

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
    signatures: [
      { label: "Desert Services Representative", who: "" },
      { label: "GC / Site Safety (Optional)", who: "" },
    ],
  };
}
