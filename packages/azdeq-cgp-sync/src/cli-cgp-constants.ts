export const LTFID_MAX_DISCOVERY_PROBES: ReadonlyArray<{
  label: string;
  query: { companyname?: string; facilityname?: string };
}> = [
  { label: "company:llc", query: { companyname: "llc" } },
  { label: "company:arizona", query: { companyname: "arizona" } },
  { label: "company:district", query: { companyname: "district" } },
  { label: "company:development", query: { companyname: "development" } },
  { label: "company:city", query: { companyname: "city" } },
  { label: "facility:phase", query: { facilityname: "phase" } },
  { label: "facility:road", query: { facilityname: "road" } },
  { label: "facility:lot", query: { facilityname: "lot" } },
  { label: "facility:school", query: { facilityname: "school" } },
  { label: "facility:solar", query: { facilityname: "solar" } },
  { label: "facility:station", query: { facilityname: "station" } },
];
