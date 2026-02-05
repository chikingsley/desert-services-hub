import {
  type Email,
  PermitStage,
  type Project,
  ProjectStage,
  TaskType,
} from "./types";

export const INITIAL_PROJECTS: Project[] = [
  {
    id: "P-001",
    name: "Skyline Heights Phase I",
    client: "Apex Development Group",
    contractNumber: "C-2024-001",
    stage: ProjectStage.EXECUTION,
    status: "Active",
    tasks: [
      {
        id: "t1",
        name: "Contract",
        type: TaskType.BINARY,
        status: true,
        isRequired: true,
        lastUpdated: "2024-01-15",
        category: "Document",
        primaryAction: "Move to Final Signature",
        checkpoints: [
          { id: "c1", label: "Email client immediately", isCompleted: true },
          { id: "c2", label: "Upload to Monday", isCompleted: true },
          { id: "c3", label: "Check for Red Flags", isCompleted: true },
        ],
        history: [
          {
            id: "h1",
            taskId: "t1",
            taskName: "Contract",
            type: "email",
            sender: "John @ Apex",
            timestamp: "2024-01-10 09:00",
            content:
              "Here is the first draft of the Skyline contract for your review.",
            attachments: [
              { name: "Skyline_Contract_v1.pdf", type: "PDF", url: "#" },
            ],
          },
          {
            id: "h2",
            taskId: "t1",
            taskName: "Contract",
            type: "file",
            sender: "Me",
            timestamp: "2024-01-12 14:30",
            content: "Uploaded the marked-up version with insurance redlines.",
            attachments: [
              { name: "Skyline_Contract_Redlined.pdf", type: "PDF", url: "#" },
            ],
          },
          {
            id: "h3",
            taskId: "t1",
            taskName: "Contract",
            type: "email",
            sender: "Legal Dept",
            timestamp: "2024-01-14 11:15",
            content: "Looks good, move forward with billing.",
          },
        ],
      },
      {
        id: "t2",
        name: "Dust Permit",
        type: TaskType.STAGED,
        status: PermitStage.FILED,
        isRequired: true,
        lastUpdated: "2024-02-10",
        category: "Permit",
        primaryAction: "Wait for Proof of Water",
        checkpoints: [
          { id: "c5", label: "Address / APN Number", isCompleted: true },
          { id: "c6", label: "NOI Received", isCompleted: true },
          { id: "c8", label: "Site Acreage", isCompleted: false },
        ],
        history: [
          {
            id: "h4",
            taskId: "t2",
            taskName: "Dust Permit",
            type: "status",
            sender: "System",
            timestamp: "2024-02-05",
            content: "Permit moved to FILED stage.",
          },
          {
            id: "h5",
            taskId: "t2",
            taskName: "Dust Permit",
            type: "file",
            sender: "Estimating",
            timestamp: "2024-02-06",
            content: "Site Drainage Plan Final attached.",
            attachments: [
              { name: "Drainage_Plan_Skyline.dwg", type: "DWG", url: "#" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "P-002",
    name: "Riverfront Plaza",
    client: "AquaCorp Properties",
    contractNumber: "C-2024-005",
    stage: ProjectStage.ESTIMATE,
    status: "Active",
    tasks: [
      {
        id: "t6",
        name: "Contract",
        type: TaskType.BINARY,
        status: false,
        isRequired: true,
        lastUpdated: "2024-02-20",
        category: "Document",
        primaryAction: "Verify surveyor arrival",
        checkpoints: [
          { id: "c10", label: "Check Red Flags", isCompleted: false },
        ],
        history: [
          {
            id: "h6",
            taskId: "t6",
            taskName: "Contract",
            type: "email",
            sender: "Estimating Team",
            timestamp: "2024-02-18",
            content: "Waiting on the final site survey to finish the estimate.",
            isActionRequired: true,
          },
          {
            id: "h7",
            taskId: "t6",
            taskName: "Contract",
            type: "comment",
            sender: "Me",
            timestamp: "2024-02-19",
            content:
              "Followed up with survey team. They said tomorrow morning.",
          },
        ],
      },
      {
        id: "t7",
        name: "Dust Permit",
        type: TaskType.STAGED,
        status: PermitStage.NOT_STARTED,
        isRequired: false,
        lastUpdated: "2024-02-21",
        category: "Permit",
        checkpoints: [],
        history: [],
      },
    ],
  },
  {
    id: "P-003",
    name: "Golden Gate Commercial",
    client: "Vista Land Holdings",
    contractNumber: "C-2024-012",
    stage: ProjectStage.PLANNING,
    status: "Active",
    tasks: [
      {
        id: "t10",
        name: "SWPPP Plan",
        type: TaskType.STAGED,
        status: PermitStage.PREPARED,
        isRequired: true,
        lastUpdated: "2024-03-01",
        category: "Narrative",
        primaryAction: "Update BMP for North Slope",
        checkpoints: [
          { id: "c100", label: "Hydrology Report", isCompleted: true },
          { id: "c101", label: "BMP Selection", isCompleted: true },
          { id: "c102", label: "QSD Sign-off", isCompleted: false },
        ],
        history: [
          {
            id: "h10",
            taskId: "t10",
            taskName: "SWPPP Plan",
            type: "email",
            sender: "QSD Specialist",
            timestamp: "2024-02-28",
            content:
              "We need to update the BMPs for the north slope due to new soil reports.",
            isActionRequired: true,
          },
          {
            id: "h11",
            taskId: "t10",
            taskName: "SWPPP Plan",
            type: "file",
            sender: "Soil Lab",
            timestamp: "2024-03-01",
            content: "North Slope Soil Analysis v2",
            attachments: [
              { name: "Soil_Report_Vista.pdf", type: "PDF", url: "#" },
            ],
          },
        ],
      },
      {
        id: "t11",
        name: "Site Signage",
        type: TaskType.BINARY,
        status: false,
        isRequired: true,
        lastUpdated: "2024-02-28",
        category: "Signage",
        checkpoints: [],
        history: [
          {
            id: "h12",
            taskId: "t11",
            taskName: "Site Signage",
            type: "comment",
            sender: "Field Sup",
            timestamp: "2024-02-27",
            content: "Confirming sign locations on the western fence.",
          },
        ],
      },
    ],
  },
];

export const INITIAL_EMAILS: Email[] = [
  {
    id: "e1",
    from: {
      name: "John Martinez",
      email: "john.martinez@apexdev.com",
    },
    to: ["permits@desertservices.com"],
    subject: "RE: Skyline Heights - Contract Review",
    preview:
      "Here is the first draft of the Skyline contract for your review. Please let me know if you have any questions.",
    body: `Hi Team,

Here is the first draft of the Skyline contract for your review. Please let me know if you have any questions or concerns.

Key points to review:
- Insurance requirements (Section 4.2)
- Payment schedule (Section 6.1)
- Completion timeline (Section 8.3)

Looking forward to your feedback.

Best regards,
John Martinez
Apex Development Group`,
    timestamp: "2024-03-15T09:30:00",
    isRead: false,
    isStarred: true,
    isActionRequired: true,
    attachments: [
      {
        id: "a1",
        name: "Skyline_Contract_v1.pdf",
        type: "PDF",
        size: "2.4 MB",
        url: "#",
      },
    ],
    tags: [
      {
        projectId: "P-001",
        projectName: "Skyline Heights Phase I",
        taskId: "t1",
        taskName: "Contract",
      },
    ],
  },
  {
    id: "e2",
    from: {
      name: "MCAQD Permits",
      email: "permits@maricopa.gov",
    },
    to: ["permits@desertservices.com"],
    subject: "Dust Permit Application Received - Skyline Heights",
    preview:
      "Your dust permit application has been received and is being processed. Application #DP-2024-0892.",
    body: `Dear Desert Services LLC,

This email confirms receipt of your dust permit application for the following project:

Project: Skyline Heights Phase I
Location: 1234 N Central Ave, Phoenix, AZ 85004
Application Number: DP-2024-0892

Your application is currently in review. Expected processing time is 5-7 business days.

Required documents received:
[X] Site plan
[X] Dust control plan
[ ] Proof of water availability (PENDING)

Please submit the missing document within 10 business days to avoid delays.

Thank you,
Maricopa County Air Quality Department`,
    timestamp: "2024-03-14T14:22:00",
    isRead: true,
    isStarred: false,
    isActionRequired: true,
    attachments: [],
    tags: [
      {
        projectId: "P-001",
        projectName: "Skyline Heights Phase I",
        taskId: "t2",
        taskName: "Dust Permit",
      },
    ],
  },
  {
    id: "e3",
    from: {
      name: "Sarah Chen",
      email: "schen@aquacorp.com",
    },
    to: ["permits@desertservices.com"],
    cc: ["estimating@desertservices.com"],
    subject: "Riverfront Plaza - Site Survey Update",
    preview:
      "Quick update on the site survey - the team ran into some issues with the property line on the east side.",
    body: `Hi,

Quick update on the site survey for Riverfront Plaza.

The survey team ran into some issues with the property line on the east side. There's a discrepancy between the recorded plat and the existing fence line that needs to be resolved.

We're working with the county to get this sorted out. Should have more info by end of week.

This might delay our timeline by a few days. I'll keep you posted.

Sarah Chen
AquaCorp Properties`,
    timestamp: "2024-03-14T11:45:00",
    isRead: false,
    isStarred: false,
    isActionRequired: false,
    attachments: [
      {
        id: "a2",
        name: "Survey_Preliminary.pdf",
        type: "PDF",
        size: "1.8 MB",
        url: "#",
      },
      {
        id: "a3",
        name: "PropertyLine_Discrepancy.jpg",
        type: "JPG",
        size: "450 KB",
        url: "#",
      },
    ],
    tags: [
      {
        projectId: "P-002",
        projectName: "Riverfront Plaza",
      },
    ],
  },
  {
    id: "e4",
    from: {
      name: "QSD Environmental",
      email: "reports@qsdenvironmental.com",
    },
    to: ["permits@desertservices.com"],
    subject: "SWPPP Update Required - Golden Gate Commercial",
    preview:
      "Based on the new soil reports, we need to update the BMPs for the north slope. See attached recommendations.",
    body: `To: Desert Services Permits Team

RE: Golden Gate Commercial - SWPPP Update

Based on the new soil analysis we received last week, we need to make some updates to the Stormwater Pollution Prevention Plan (SWPPP) for the north slope area.

Key changes needed:
1. Additional erosion control blankets on slopes > 3:1
2. Modified sediment basin sizing (increased by 15%)
3. New inlet protection specifications

I've attached our updated BMP recommendations. Please review and let me know if you have questions before we submit the revised plan to the ADEQ.

Timeline: We need to submit by end of next week to stay on schedule.

Best,
Mike Thompson
QSD Environmental Services`,
    timestamp: "2024-03-13T16:10:00",
    isRead: true,
    isStarred: true,
    isActionRequired: true,
    attachments: [
      {
        id: "a4",
        name: "SWPPP_BMP_Recommendations.pdf",
        type: "PDF",
        size: "3.2 MB",
        url: "#",
      },
    ],
    tags: [
      {
        projectId: "P-003",
        projectName: "Golden Gate Commercial",
        taskId: "t10",
        taskName: "SWPPP Plan",
      },
    ],
  },
  {
    id: "e5",
    from: {
      name: "Dave Wilson",
      email: "dwilson@vistaholdings.com",
    },
    to: ["permits@desertservices.com"],
    subject: "Sign placement confirmation needed",
    preview:
      "Can you confirm the sign locations we discussed? Need to order materials by Friday.",
    body: `Hey team,

Can you confirm the sign placement locations we discussed last week for Golden Gate Commercial?

We need:
- Project identification sign (main entrance)
- Safety signage (3 locations)
- Directional signs (2 locations)

Need to get the order in by Friday to have everything ready for the site prep next month.

Thanks,
Dave Wilson
Vista Land Holdings`,
    timestamp: "2024-03-13T10:30:00",
    isRead: true,
    isStarred: false,
    isActionRequired: false,
    attachments: [],
    tags: [
      {
        projectId: "P-003",
        projectName: "Golden Gate Commercial",
        taskId: "t11",
        taskName: "Site Signage",
      },
    ],
  },
  {
    id: "e6",
    from: {
      name: "Accounting",
      email: "accounting@desertservices.com",
    },
    to: ["permits@desertservices.com"],
    subject: "Invoice reminder - Permit fees due",
    preview:
      "Friendly reminder that the following permit fees are due this week.",
    body: `Hi Permits Team,

Friendly reminder that the following permit fees are due this week:

1. Skyline Heights - Dust Permit Fee: $450
   Due: March 18, 2024

2. Golden Gate - SWPPP Filing Fee: $275
   Due: March 20, 2024

Please confirm once payments are submitted.

Thanks,
Accounting Team`,
    timestamp: "2024-03-12T08:00:00",
    isRead: true,
    isStarred: false,
    isActionRequired: false,
    attachments: [],
    tags: [],
  },
  {
    id: "e7",
    from: {
      name: "Legal Department",
      email: "legal@desertservices.com",
    },
    to: ["permits@desertservices.com"],
    subject: "Contract approved - Skyline Heights",
    preview:
      "The Skyline Heights contract has been reviewed and approved. Ready for signature.",
    body: `Permits Team,

Good news - we've completed our review of the Skyline Heights contract with Apex Development Group.

The contract is approved with no changes needed. It's ready for signature.

Please coordinate with John Martinez at Apex to get the final signatures and return a fully executed copy for our records.

Legal Department`,
    timestamp: "2024-03-11T15:45:00",
    isRead: true,
    isStarred: false,
    isActionRequired: false,
    attachments: [
      {
        id: "a5",
        name: "Skyline_Contract_APPROVED.pdf",
        type: "PDF",
        size: "2.5 MB",
        url: "#",
      },
    ],
    tags: [
      {
        projectId: "P-001",
        projectName: "Skyline Heights Phase I",
        taskId: "t1",
        taskName: "Contract",
      },
    ],
  },
];
