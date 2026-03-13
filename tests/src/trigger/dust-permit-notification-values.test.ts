import { describe, expect, test } from "bun:test";

import {
  formatNotificationAcreage,
  formatNotificationSiteAddress,
} from "../../../apps/trigger-dev/src/trigger/dust-permit-notification-values";

describe("dust permit notification value helpers", () => {
  test("uses scraped disturbed area when available", () => {
    expect(formatNotificationAcreage("6.15 Acres")).toBe("6.15 Acres");
    expect(formatNotificationAcreage("")).toBe("N/A");
  });

  test("prefers the selected scraped permit location for the site address", () => {
    expect(
      formatNotificationSiteAddress(
        {
          address: "1050 E RILEY DR",
          city: "AVONDALE",
        },
        {
          locations: [
            {
              address: "725 N ELISEO C FELIX JR WAY",
              city: "AVONDALE",
              isSelected: false,
              state: "Arizona",
              zip: "85323",
            },
            {
              address: "1050 E RILEY DR",
              city: "AVONDALE",
              isSelected: true,
              state: "Arizona",
              zip: "85323",
            },
          ],
        }
      )
    ).toBe("1050 E RILEY DR, AVONDALE, AZ 85323");
  });

  test("falls back to the permit row address and city when scrape data is missing", () => {
    expect(
      formatNotificationSiteAddress({
        address: "1050 E RILEY DR",
        city: "AVONDALE",
      })
    ).toBe("1050 E RILEY DR, AVONDALE");
  });

  test("prefers the richer permit row address when scrape data only has city-level detail", () => {
    expect(
      formatNotificationSiteAddress(
        {
          address: "5215 N ALSUP RD",
          city: "LITCHFIELD PARK",
        },
        {
          locations: [
            {
              address: "",
              city: "GLENDALE",
              isSelected: true,
              state: "Arizona",
              zip: "",
            },
          ],
        }
      )
    ).toBe("5215 N ALSUP RD, LITCHFIELD PARK");
  });
});
