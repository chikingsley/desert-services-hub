# Printing Inspections - Standard Operating Procedure

## Overview

This SOP outlines the process for printing inspection reports using mail merge automation with the master schedule from SharePoint.

- --

## Part 1: Update and Create a Copy of the Master Schedule

### Step 1: Access the Master Schedule

1. Navigate to **SharePoint**
2. Locate and open the **Master Schedule** Excel document

    - Location: `upload main master`
    - This file contains all inspections

### Step 2: Sort and Filter Data

1. **Highlight all data** in the spreadsheet
2. Apply **Custom Sort** with the following criteria:

    - Primary: Sort by **Inspector**
    - Secondary: Sort by **Last Inspection**

### Step 3: Update Inspection Dates

1. Update the **"Last Inspection"** column with the date each inspection was completed

    - **IMPORTANT:** Never change the "Next Inspection" column
    - Only update the "Last Inspection" column

### Step 4: Download a Working Copy

1. Go to **File**→**Create a Copy**
2. Select **Download a Copy**
3. Save the file to your **Desktop**
4. Close the online file
5. Open the downloaded copy from your Desktop
6. Click **Enable Editing** if prompted

- --

## Part 2: Mail Merge Automation Through Word

### Step 5: Open the Inspection Template

1. Open the **Master Inspection Report Print** template in Microsoft Word

    - This is the inspection report template used for all reports

### Step 6: Start Mail Merge

1. Navigate to **Mailings**tab →**Start Mail Merge**→**Step by Step Mail Merge**
2. Click through to **Step 3**
3. Click **Browse**
4. Navigate to your **Desktop** and select the Excel copy created in Part 1

### Step 7: Link the Data Source

1. Select the **Upload$** sheet
2. Click **Okay** twice to confirm

### Step 8: Complete the Merge

1. Click through to **Step 6**
2. Select **Finish and Merge**

### Step 9: Print the Reports

1. In the merge dialog, specify the range:

    - **From:** [Starting record number for the specific inspector]
    - **To:** [Ending record number for the specific inspector]
2. Click **Okay**
3. In **Print Properties**, configure:

    - **Finishing:** Single-sided
    - **Hole-punched:** Yes
4. Click **Okay** twice to send to printer

- --

## Notes

- Ensure the master schedule is up to date before beginning the mail merge process
- Verify the correct inspector range before printing to avoid wasting paper
- Keep the desktop copy until printing is complete and verified
