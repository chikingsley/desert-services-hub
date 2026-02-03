
import { Email, Project, Attachment, TriageItem, Estimate, Task } from './types';

export const MOCK_ATTACHMENTS: Attachment[] = [
  { id: 'a1', name: 'PCSD_Music_Bldg_Plans.pdf', size: '4.2 MB', type: 'application/pdf', url: '#', category: 'Blueprint' },
  { id: 'a2', name: 'Dust_Permit_Application_220668.pdf', size: '1.1 MB', type: 'application/pdf', url: '#', category: 'Permit' },
  { id: 'a3', name: 'Bellmont_Contract_V2.docx', size: '850 KB', type: 'application/msword', url: '#', category: 'Contract' },
  { id: 'a4', name: 'Site_Photos_Jan27.zip', size: '12 MB', type: 'application/zip', url: '#', category: 'Other' },
  { id: 'a5', name: 'Invoice_INV-0098.pdf', size: '240 KB', type: 'application/pdf', url: '#', category: 'Invoice' },
  { id: 'a6', name: 'Zoning_Approval_Maricopa.pdf', size: '1.8 MB', type: 'application/pdf', url: '#', category: 'Permit' },
];

export const MOCK_ESTIMATES: Estimate[] = [
  { id: 'est1', number: 'EST-2026-001', amount: '$42,500', status: 'Sent', date: 'Jan 15, 2026' },
  { id: 'est2', number: 'EST-2026-042', amount: '$12,800', status: 'Won', date: 'Jan 20, 2026' },
  { id: 'est3', number: 'EST-2026-088', amount: '$125,000', status: 'Draft', date: 'Jan 25, 2026' },
  { id: 'est4', number: 'EST-2026-112', amount: '$68,400', status: 'Sent', date: 'Jan 28, 2026' },
];

export const MOCK_TASKS: Task[] = [
  { id: 't1', title: 'File Dust Permit Application', status: 'Pending', dueDate: 'Feb 5, 2026', assignee: 'Chi E.' },
  { id: 't2', title: 'Validate Vendor Insurance', status: 'Done', dueDate: 'Jan 27, 2026', assignee: 'System' },
  { id: 't3', title: 'Schedule Site Visit', status: 'In Progress', dueDate: 'Feb 1, 2026', assignee: 'Michael R.' },
  { id: 't4', title: 'Review Blueprint Revisions', status: 'Pending', dueDate: 'Feb 10, 2026', assignee: 'Chi E.' },
  { id: 't5', title: 'Finalize Subcontractor List', status: 'Done', dueDate: 'Jan 25, 2026', assignee: 'Michael R.' },
];

export const MOCK_PROJECTS: Project[] = [
  {
    id: 'p1',
    name: 'Sun Health La Loma',
    client: 'Bellmont Homes',
    status: 'Permitting',
    emails: ['e1', 'e2', 'e5'],
    files: [MOCK_ATTACHMENTS[1], MOCK_ATTACHMENTS[3]],
    estimates: [MOCK_ESTIMATES[0], MOCK_ESTIMATES[1]],
    tasks: [MOCK_TASKS[0], MOCK_TASKS[1], MOCK_TASKS[3]],
    startDate: 'Jan 01, 2026',
    endDate: 'Jun 30, 2026',
    lastActivity: '2 hours ago',
    progress: 45,
    description: 'Expansion of the Resident Gathering Space (RGS) including interior remodeling and outdoor landscaping.'
  },
  {
    id: 'p2',
    name: 'Greenway Billing Hub',
    client: 'Embrey Construction',
    status: 'Active',
    emails: ['e3'],
    files: [MOCK_ATTACHMENTS[4]],
    estimates: [MOCK_ESTIMATES[2]],
    tasks: [MOCK_TASKS[2]],
    startDate: 'Feb 15, 2026',
    endDate: 'Dec 15, 2026',
    lastActivity: '1 day ago',
    progress: 30,
    description: 'New billing facility infrastructure setup for Greenway corporate office.'
  },
  {
    id: 'p3',
    name: 'Maricopa Logistics Park',
    client: 'PWI Construction',
    status: 'Active',
    emails: ['e6'],
    files: [MOCK_ATTACHMENTS[5]],
    estimates: [MOCK_ESTIMATES[3]],
    tasks: [MOCK_TASKS[4]],
    startDate: 'Mar 01, 2026',
    endDate: 'Nov 01, 2026',
    lastActivity: '3 hours ago',
    progress: 15,
    description: 'Grading and sitework for a 500,000 sq ft logistics warehouse.'
  }
];

export const MOCK_EMAILS: Email[] = [
  {
    id: 'e1',
    sender: 'Kendra Ash',
    senderEmail: 'kash@bellmonthomes.com',
    subject: 'RE: Sun Health La Loma RGS — PO 25014-21',
    body: 'Team, New PO intake for Sun Health La Loma - Resident Gathering Space (RGS). Purchase order received via DocuSign. Project: Sun Health La Loma — Resident Gathering Space GC: PWI Construction, Inc. PWI Job No: 25-...',
    timestamp: 'Jan 27, 2026, 6:24 AM',
    attachments: [MOCK_ATTACHMENTS[2]],
    tags: ['CONTRACT', 'URGENT'],
    projectId: 'p1',
    estimateId: 'est1',
    isRead: false,
    aiSummary: 'PO intake for Sun Health La Loma project. Matches Estimate #EST-2026-001.',
  },
  {
    id: 'e2',
    sender: 'Chi Ejimofor',
    senderEmail: 'chi@desertservices.net',
    subject: 'Re: 220668 - PCSD Music Building Desert Services SCO002',
    body: 'Best, Chi Ejimofor M: (304) 216-8700 From: Contracts Sent: Tuesday, January 27, 2026 at 3:03AM To: Chi Ejimofor Subject: Re: 220668 - PCSD Music Building Desert Services SCO002 Requested new link.',
    timestamp: 'Jan 27, 2026, 3:03 AM',
    attachments: [MOCK_ATTACHMENTS[0], MOCK_ATTACHMENTS[1]],
    tags: ['PERMIT'],
    projectId: 'p1',
    isRead: true,
    aiSummary: 'Request for new document links regarding PCSD Music Building.',
  },
  {
    id: 'e3',
    sender: 'Simon Cuadra',
    senderEmail: 'simon.cuadra@embrey.com',
    subject: 'RE: Greenway | January Billings',
    body: 'Sorry I was off yesterday, it has been added. Thanks! Let me know if you need anything else for the audit.',
    timestamp: 'Jan 26, 2026, 10:50 PM',
    attachments: [MOCK_ATTACHMENTS[4]],
    tags: ['BILLING'],
    projectId: 'p2',
    isRead: true,
    aiSummary: 'Billing update for Greenway project. Audit ready.',
  },
  {
    id: 'e4',
    sender: 'System Admin',
    senderEmail: 'noreply@citypermits.gov',
    subject: 'Unlinked Permit Notification: #DX-9901',
    body: 'A new dust permit application has been filed for the parcel at 4401 E McDowell Rd. No associated project found in your records.',
    timestamp: 'Jan 26, 2026, 2:15 PM',
    attachments: [],
    tags: ['TRIAGE NEEDED'],
    isRead: false,
    aiSummary: 'Unmatched permit found. High probability it belongs to "McDowell Project" estimate #EST-2026-088.',
  },
  {
    id: 'e5',
    sender: 'Michael Ricks',
    senderEmail: 'mricks@desertservices.net',
    subject: 'Sun Health La Loma RGS — PO Intake (Reconciled)',
    body: 'Matching, yes. Sent out, yes. Setup in QB, checking. Best, Michael.',
    timestamp: 'Jan 27, 2026, 6:14 AM',
    attachments: [],
    tags: ['ACCOUNTING'],
    projectId: 'p1',
    isRead: true,
  },
  {
    id: 'e6',
    sender: 'David Sloan',
    senderEmail: 'dsloan@pwiconstruction.com',
    subject: 'Maricopa Logistics Prime Contract',
    body: 'We are moving forward with the sitswork. Please review the attached contract for Maricopa Logistics Park.',
    timestamp: 'Jan 28, 2026, 11:20 AM',
    attachments: [MOCK_ATTACHMENTS[5]],
    tags: ['CONTRACT'],
    projectId: 'p3',
    isRead: false,
  }
];

export const MOCK_TRIAGE_ITEMS: TriageItem[] = [
  {
    id: 't1',
    type: 'new_email',
    title: 'Kendra Ash',
    subtitle: 'RE: Sun Health La Loma RGS — PO 25014-21',
    timestamp: '6:24 AM',
    metadata: MOCK_EMAILS[0],
    isResolved: false
  },
  {
    id: 't2',
    type: 'unlinked_doc',
    title: 'Dust Permit #DX-9901',
    subtitle: 'Unlinked Document - McDowell Rd',
    timestamp: '2:15 PM',
    metadata: MOCK_EMAILS[3],
    isResolved: false
  },
  {
    id: 't3',
    type: 'project_update',
    title: 'Greenway Billing',
    subtitle: 'January Billings updated',
    timestamp: 'Yesterday',
    metadata: MOCK_EMAILS[2],
    isResolved: true
  },
  {
    id: 't4',
    type: 'new_email',
    title: 'David Sloan',
    subtitle: 'Maricopa Logistics Prime Contract',
    timestamp: '3h ago',
    metadata: MOCK_EMAILS[5],
    isResolved: false
  }
];
