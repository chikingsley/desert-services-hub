import { BOARDS, ESTIMATING_NON_PROD_GROUPS } from "../config";

export type BucketKey =
  | "direct"
  | "relation_fallback"
  | "display_fallback"
  | "unresolved";

export type FallbackSpec =
  | {
      kind: "relation";
      columnId: string;
      label: string;
      requiresDisplay?: boolean;
    }
  | {
      kind: "contact_to_contractors";
      contactRelationColumnId: string;
      contactBoardId: string;
      contactToContractorColumnId: string;
      label: string;
    };

export interface AuditChainSpec {
  key: string;
  label: string;
  boardAlias: string;
  boardId: string;
  directColumnId: string;
  directLabel: string;
  fallback?: FallbackSpec;
  displayFallbackColumnIds: string[];
  displayFallbackLabel: string;
  skipGroupsWhenActiveOnly?: string[];
}

export interface RichColumnValue {
  id: string;
  type: string;
  text: string | null;
  value: string | null;
  linked_item_ids?: string[];
  display_value?: string | null;
}

export interface AuditItem {
  id: string;
  name: string;
  groupId: string;
  groupTitle: string;
  columnValues: RichColumnValue[];
}

export interface AuditResult {
  spec: AuditChainSpec;
  totalItems: number;
  filteredOut: number;
  counts: Record<BucketKey, number>;
  samples: Record<BucketKey, string[]>;
}

export const AUDIT_CHAINS: AuditChainSpec[] = [
  {
    boardAlias: "estimating",
    boardId: BOARDS.estimating,
    directColumnId: "board_relation_mkzdd0r4",
    directLabel: "Contractors - Direct",
    displayFallbackColumnIds: ["deal_account"],
    displayFallbackLabel: "Contractor mirror display",
    fallback: {
      kind: "contact_to_contractors",
      contactRelationColumnId: "deal_contact",
      contactBoardId: BOARDS.contacts,
      contactToContractorColumnId: "contact_account",
      label: "Legacy Contacts relation -> Contacts.contact_account",
    },
    key: "estimating-account",
    label: "Estimating: Contractor/Account Resolution",
    skipGroupsWhenActiveOnly: ESTIMATING_NON_PROD_GROUPS,
  },
  {
    boardAlias: "estimating",
    boardId: BOARDS.estimating,
    directColumnId: "board_relation_mm065k5n",
    directLabel: "Contacts - Direct",
    displayFallbackColumnIds: [],
    displayFallbackLabel: "(none)",
    fallback: {
      kind: "relation",
      columnId: "deal_contact",
      label: "Legacy Contacts relation",
    },
    key: "estimating-contacts",
    label: "Estimating: Contacts Resolution",
    skipGroupsWhenActiveOnly: ESTIMATING_NON_PROD_GROUPS,
  },
  {
    boardAlias: "leads",
    boardId: BOARDS.leads,
    directColumnId: "board_relation_mktg3z60",
    directLabel: "Estimate Name relation",
    displayFallbackColumnIds: ["lookup_mktg8b1z", "lookup_mktgymd0"],
    displayFallbackLabel: "Mirrors (Bid Status/Contractor)",
    key: "leads-estimate-link",
    label: "Leads: Estimate Link Health",
  },
  {
    boardAlias: "projects",
    boardId: BOARDS.projects,
    directColumnId: "board_relation_mkp8pr9e",
    directLabel: "Service Lines (direct)",
    displayFallbackColumnIds: ["lookup_mktg3b6w"],
    displayFallbackLabel: "Service Lines mirror",
    fallback: {
      kind: "relation",
      columnId: "board_relation_mktgn7cb",
      label: "Linked Estimate relation",
      requiresDisplay: true,
    },
    key: "projects-service-lines",
    label: "Projects: Service Lines Resolution",
  },
  {
    boardAlias: "dust_permits",
    boardId: BOARDS.dust_permits,
    directColumnId: "board_relation_mkxfk8ky",
    directLabel: "Contractors (direct)",
    displayFallbackColumnIds: ["lookup_mkxp5f5n", "lookup_mkxmqvqk"],
    displayFallbackLabel: "Account mirrors",
    fallback: {
      kind: "relation",
      columnId: "board_relation_mkxmhqdf",
      label: "Linked Estimate relation",
      requiresDisplay: true,
    },
    key: "dust-account",
    label: "Dust Permits: Account Resolution",
  },
  {
    boardAlias: "dust_permits",
    boardId: BOARDS.dust_permits,
    directColumnId: "board_relation_mkxmh6zg",
    directLabel: "Contacts (direct)",
    displayFallbackColumnIds: ["lookup_mkxpsgqk"],
    displayFallbackLabel: "Contacts mirror",
    fallback: {
      kind: "relation",
      columnId: "board_relation_mkxmhqdf",
      label: "Linked Estimate relation",
      requiresDisplay: true,
    },
    key: "dust-contacts",
    label: "Dust Permits: Contacts Resolution",
  },
  {
    boardAlias: "swppp_plans",
    boardId: BOARDS.swppp_plans,
    directColumnId: "board_relation_mktmfqzj",
    directLabel: "Estimating relation",
    displayFallbackColumnIds: ["lookup_mktmqf1r"],
    displayFallbackLabel: "Status mirror",
    key: "swppp-estimate-link",
    label: "SWPPP Plans: Estimate Link Health",
  },
  {
    boardAlias: "inspection_reports",
    boardId: BOARDS.inspection_reports,
    directColumnId: "board_relation_mkpfq0mk",
    directLabel: "Project relation",
    displayFallbackColumnIds: ["lookup_mkrws4a7", "lookup_mkqy8nyj"],
    displayFallbackLabel: "Project-derived mirrors",
    key: "inspection-project-link",
    label: "Inspection Reports: Project Link Health",
  },
  {
    boardAlias: "contractors",
    boardId: BOARDS.contractors,
    directColumnId: "account_contact",
    directLabel: "Contacts relation",
    displayFallbackColumnIds: [],
    displayFallbackLabel: "(none)",
    key: "contractors-contacts-link",
    label: "Contractors: Contacts Link Health",
  },
  {
    boardAlias: "contacts",
    boardId: BOARDS.contacts,
    directColumnId: "contact_account",
    directLabel: "Contractor relation",
    displayFallbackColumnIds: [],
    displayFallbackLabel: "(none)",
    key: "contacts-contractor-link",
    label: "Contacts: Contractor Link Health",
  },
  {
    boardAlias: "service_lines",
    boardId: BOARDS.service_lines,
    directColumnId: "board_relation_mkp8rqas",
    directLabel: "Projects relation",
    displayFallbackColumnIds: [],
    displayFallbackLabel: "(none)",
    key: "service-lines-project-link",
    label: "Service Lines: Projects Link Health",
  },
];
