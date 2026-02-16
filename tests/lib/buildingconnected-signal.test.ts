import { describe, expect, it } from "bun:test";
import { hasBuildingConnectedSignal } from "@/apps/workers/buildingconnected-file-sync/lib/signal";

function baseSignalRow() {
  return {
    body_preview: null,
    from_domain: null,
    from_email: null,
    original_sender_domain: null,
    original_sender_email: null,
    platform_name: null,
    real_sender_domain: null,
    real_sender_email: null,
    subject: null,
  };
}

describe("BuildingConnected signal detection", () => {
  it("matches sender domain", () => {
    expect(
      hasBuildingConnectedSignal({
        ...baseSignalRow(),
        from_domain: "buildingconnected.com",
      })
    ).toBe(true);
  });

  it("matches sender email suffix", () => {
    expect(
      hasBuildingConnectedSignal({
        ...baseSignalRow(),
        from_email: "team@buildingconnected.com",
      })
    ).toBe(true);
  });

  it("matches platform name", () => {
    expect(
      hasBuildingConnectedSignal({
        ...baseSignalRow(),
        platform_name: "BuildingConnected",
      })
    ).toBe(true);
  });

  it("matches subject/body hints", () => {
    expect(
      hasBuildingConnectedSignal({
        ...baseSignalRow(),
        subject: "Invitation from BuildingConnected",
      })
    ).toBe(true);
    expect(
      hasBuildingConnectedSignal({
        ...baseSignalRow(),
        body_preview: "View this invite on buildingconnected.com",
      })
    ).toBe(true);
  });

  it("does not match unrelated rows", () => {
    expect(
      hasBuildingConnectedSignal({
        ...baseSignalRow(),
        from_domain: "example.com",
        subject: "General contractor update",
      })
    ).toBe(false);
  });
});
