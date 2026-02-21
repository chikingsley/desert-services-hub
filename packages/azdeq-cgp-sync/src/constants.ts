export interface ArizonaCounty {
  code: string;
  name: string;
}

export const ARIZONA_COUNTIES: readonly ArizonaCounty[] = [
  { code: "04001", name: "APACHE" },
  { code: "04003", name: "COCHISE" },
  { code: "04005", name: "COCONINO" },
  { code: "04007", name: "GILA" },
  { code: "04009", name: "GRAHAM" },
  { code: "04011", name: "GREENLEE" },
  { code: "04012", name: "LA PAZ" },
  { code: "04013", name: "MARICOPA" },
  { code: "04015", name: "MOHAVE" },
  { code: "04017", name: "NAVAJO" },
  { code: "04019", name: "PIMA" },
  { code: "04021", name: "PINAL" },
  { code: "04023", name: "SANTA CRUZ" },
  { code: "04025", name: "YAVAPAI" },
  { code: "04027", name: "YUMA" },
] as const;

export const COUNTY_NAME_BY_CODE = new Map(
  ARIZONA_COUNTIES.map((county) => [county.code, county.name])
);

export const DEFAULT_CGP_ENDPOINT =
  "https://my.azdeq.gov/deq-search/service/permit/cgp";

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export const DEFAULT_REFERER =
  "https://my.azdeq.gov/deq-search/cgp/search-result";
