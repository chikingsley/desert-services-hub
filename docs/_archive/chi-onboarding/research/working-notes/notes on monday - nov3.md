# Monday.com Sales Workflow - Questions & Issues

## Top Projects Board

### Missing Features/Inconsistencies

- **Inspection Buttons**: Some items have inspection buttons, others don't - why the inconsistency? Is this automatic?
- **Attachments & Estimates**: How do these get attached? Is it automatic or manual?
- **Gears Icon**: Some items show the gears icon, others don't - what determines this?

### Automatic vs Manual Fields

- **Contractor Linking**: Should contractors be automatically linked? Currently seems inconsistent
- **Account Field**: Appears to be automatic
- **Awarded Value**: Locked field - confirmed it comes from Estimating Board (but often not set)
- **Start Date**: Comes from Estimating Board - only set sometimes

### Potentially Redundant Fields

- **Address Fields**: We have individual fields (Building Number, House Number, Street, City, State, Zip) but also pulling full Location from SMA board

  - Question: Are these individual address fields necessary if we already have Location?

### Unclear/Unexplained Fields

- **Percent Completion**: What is this measuring?
- **"(Old)" Columns**: Multiple columns labeled with "old" or in quotation marks - what does this mean? Can these be archived?
- **Estimate Linked**: Yes/No field - appears manual. Who is supposed to click this?
- **Missing Estimate**: Manual checkbox? None are filled out - is this field being used?
- **Estimated Revenue**: Sum column - what is it summing?
- **Location Old**: What is this?
- **Formula Column**: Purpose unclear

### Contact Information Questions

- **RFP Contact Name**: Where is this pulled from? Why is it here?
- **RFP Contact Name** (duplicate?): Why do we have this if we're pulling contacts from Estimating Board? Are these supposed to be different?
- **RFP Email, Phone Number**: Why aren't these linked to the Contacts Board or Contractors Board instead of being standalone fields?

### Legacy/Unused Columns

- Start Date Old
- End Date Old
- GC (General Contractor) column
- Project Created column

## Estimating Board

### Excess Columns Issue

The Estimating Board has many extra columns that may not be necessary:

- Sales Contact
- Deal Creation Date
- Forecast Value
- Awarded Field
- Sales Refer (Sales Referral?)
- Bid Value
- Awarded Value
- Close Date

### Missing Functionality

- **Estimates Attachment**: Could we attach estimates here? Would be useful
- **Shell Estimates**: What is this and why is it there?

### Fields That Could Be Better Utilized

- Location field has many unfilled entries
- Other fields that could be populated but aren't

### Need for Review

- Complete audit needed: What fields do we actually need?
- What's essential vs what's legacy/unused?

## Groups/Status Categories

### Unclear Group Purposes

- **Pending One**: What does this status mean?
- **Lost**: What criteria moves a deal here?
- **Won**: Clear, but process to move here unclear
- **Added to Projects**: Why is this separate? What triggers this?
- **Sales Team Estimates**: Is this old? What's the purpose?

### Data Inconsistencies

- **Lost Deals Discrepancy**: 35 lost leads on RFQ board, but only 2 lost deals on Estimating Board

  - Why the mismatch?
  - Should deals from Leads backpropagate to update Estimating Board?

## Overall Process Questions

### Sales Workflow Process

- What is the intended end-to-end process?
- When a lead becomes a top project, what's the workflow?
- What should happen automatically vs manually?
- What fields should sync between boards?

### Deals Board Integration

- Deals from Leads board should backpropagate to update Estimating Board
- Is this working correctly?
- What's the expected behavior?

## Action Items

1. Define clear sales workflow process documentation
2. Audit all fields on Estimating Board - determine what's essential
3. Remove or archive "old" columns
4. Clarify automatic vs manual field population
5. Resolve contact information redundancy (link to Contacts/Contractors boards?)
6. Fix lost deals data inconsistency between boards
7. Document group/status category meanings and triggers
8. Determine if individual address fields are needed when Location field exists
9. Clarify purpose of Shell Estimates
10. Review and standardize inspection buttons and attachments process
