export interface EstimateUpsertRow {
  mondayItemId: string;
  name: string;
  estimateNumber: string | null;
  contractor: string | null;
  groupId: string;
  groupTitle: string;
  mondayUrl: string;
  accountId: number | null;
  accountMondayId: string | null;
  accountDomain: string | null;
  bidStatus: string | null;
  bidValue: number | null;
  awardedValue: number | null;
  bidSource: string | null;
  awarded: boolean;
  dueDate: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  sharepointUrl: string | null;
}
