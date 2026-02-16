# Safety Documents Reference

This folder contains copies of the actual safety documents that have been
sent to contractors.

## Documents Included

### Most Frequently Sent (Standard Documents)

1. Desert_Services_-_Safety_Manual.pdf - Sent 6+ times (most common)
2. Safety_-_Desert_Services_Heat_Illness_Program.pdf - Sent 7 times
3. Safety_-_Desert_Services_HASP_4_2025.pdf - Sent 6 times
4. Desert_Services__LLC_-_Workplace_Safety_and_Risk_Management__USNI_.pdf
   - Sent 6 times
5. Safety_-_Desert_Services_Emergency_Contact_List_Final.pdf - Sent 5 times
6. Safety_-_Desert_Services_SDS_List.pdf - Sent 5 times
7. Subcontractor_Safety_Management_Plan_October_26.pdf - Sent by Kendra
8. Chemical_List___SDS.pdf - Sent 2 times

### Additional Documents

- Desert_Services_LLC_Safety_Manual.pdf - Alternative safety manual
- Desert_Services_HASP_4_2025.pdf - HASP document (alternative version)
- Desert_Services_Fire_Safety_Program.pdf - Fire safety program
- Safety_Brochure.pdf - Safety brochure
- Safety_Brochure_-_AZ.pdf - Arizona-specific safety brochure
- 2026_Safety.pdf - 2026 safety updates
- AW_Exhibit_G_Subcontractor-Seller_Safety_Requirements.pdf
  - AW exhibit requirements

## Usage

These documents are reference copies downloaded from email attachments. Use them when:

1. Responding to safety plan requests
2. Need to see what was previously sent
3. Need to verify document content before sending

## Site-Specific Safety Plans (SSSP)

Site-specific safety plans are project-specific and are NOT included here. They should be:

- Stored in project folders: `/Projects/[Status]/[Project Name]/Safety/`
- Named with "SSSP" or "Site Specific Safety Plan" in the filename
- Example: "MT Builders SSSP.pdf" for Magnolia Indian School project

## Source

These documents were downloaded from MinIO storage (email attachments) on
January 28, 2026.

To update this folder, run:

```bash
bun docs/processes/copy-safety-documents.ts
```

(Note: Script removed after initial copy - recreate if needed)
