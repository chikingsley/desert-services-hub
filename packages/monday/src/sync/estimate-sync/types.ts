export interface EstimateUpsertRow {
  accountDomain: string | null;
  accountId: number | null;
  accountMondayId: string | null;
  awarded: boolean;
  awardedValue: number | null;
  bidSource: string | null;
  bidStatus: string | null;
  bidValue: number | null;
  contractor: string | null;
  dueDate: string | null;
  estimateNumber: string | null;
  groupId: string;
  groupTitle: string;
  lat: number | null;
  lng: number | null;
  location: string | null;
  mondayItemId: string;
  mondayUrl: string;
  name: string;
  sharepointUrl: string | null;
}
