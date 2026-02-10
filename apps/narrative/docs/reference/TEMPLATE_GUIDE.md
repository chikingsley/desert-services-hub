# Word Template Guide

This guide shows you how to prepare your Word templates (.docx files) to work with AutoNarrative.

## How It Works

The system uses **Jinja2** template syntax inside your Word documents. You edit the template in Microsoft Word and insert special tags where you want data to appear.

## Basic Tags

### Simple Variable Insertion

To insert a variable, use double curly braces: `{{ variable_name }}`

**Example in Word:**
```
Project Name: {{ project_name }}
Address: {{ project_address }}
Permit Number: {{ permit_number }}
```

**Result after generation:**
```
Project Name: Main Street Shopping Center
Address: 123 Main St
Permit Number: CAS000002
```

## Available Variables

Based on the current SWPPP data model, you can use these variables in your template:

### Project Information
- `{{ project_name }}` - Project name
- `{{ project_address }}` - Project street address
- `{{ city }}` - City
- `{{ state }}` - State code (e.g., CA)
- `{{ zip_code }}` - ZIP code
- `{{ county }}` - County name
- `{{ apn }}` - Assessor Parcel Number
- `{{ latitude }}` - Latitude coordinate
- `{{ longitude }}` - Longitude coordinate

### Permit Information
- `{{ permit_number }}` - NPDES/State permit number
- `{{ wdid }}` - Waste Discharge ID
- `{{ permit_issue_date }}` - Permit issue date
- `{{ project_start_date }}` - Project start date
- `{{ project_end_date }}` - Project end date
- `{{ disturbed_area_acres }}` - Total disturbed area

### Owner Contact
- `{{ owner_name }}` - Owner name
- `{{ owner_title }}` - Owner title
- `{{ owner_company }}` - Owner company
- `{{ owner_phone }}` - Owner phone
- `{{ owner_email }}` - Owner email

### Contractor Contact
- `{{ contractor_name }}` - Contractor name
- `{{ contractor_title }}` - Contractor title
- `{{ contractor_company }}` - Contractor company
- `{{ contractor_phone }}` - Contractor phone
- `{{ contractor_email }}` - Contractor email

### QSP Contact
- `{{ qsp_name }}` - QSP name
- `{{ qsp_title }}` - QSP title
- `{{ qsp_company }}` - QSP company
- `{{ qsp_phone }}` - QSP phone
- `{{ qsp_email }}` - QSP email

### Document Information
- `{{ swppp_prepared_date }}` - Date SWPPP was prepared
- `{{ swppp_revision }}` - Revision number
- `{{ site_description }}` - Site description
- `{{ receiving_waters }}` - Receiving water bodies

## Advanced Features

### Conditional Content

Show content only if a value exists:

```
{% if operator_name %}
Operator: {{ operator_name }}
Company: {{ operator_company }}
{% endif %}
```

### Date Formatting

```
Start Date: {{ project_start_date.strftime('%B %d, %Y') }}
```
This would show: "Start Date: January 15, 2025"

### Tables

You can use Jinja2 tags in Word tables too. Put `{{ variable_name }}` directly in table cells.

## Important Tips

1. **Use unbreakable spaces**: Press `Ctrl+Shift+Space` (Windows) or `Cmd+Shift+Space` (Mac) for spaces at the beginning or end of lines

2. **Tag formatting**: Make sure your tags don't get split across formatting changes. If you make `{{` bold but `variable_name}}` is not bold, it won't work.

3. **Test your template**: Use the `/api/v1/swppp/validate` endpoint to check if your data is valid before generating documents

4. **Preview in Word**: Your template will have tags like `{{ project_name }}` visible when you edit it in Word

## Step-by-Step: Editing Your Template

1. Open your existing Word template (cgp_p3_template.docx or msgp_swppp_template.doc)

2. Find places where you currently have placeholder text or blanks

3. Replace them with the appropriate `{{ variable_name }}` tags

4. Save the file as a .docx file in the `templates/` directory

5. Test it by calling the API with sample data

## Example Template Section

**Before (original template):**
```
PROJECT INFORMATION

Project Name: ___________________
Address: _______________________
City: __________ State: ___ ZIP: _______
Permit Number: ________________
```

**After (with tags):**
```
PROJECT INFORMATION

Project Name: {{ project_name }}
Address: {{ project_address }}
City: {{ city }} State: {{ state }} ZIP: {{ zip_code }}
Permit Number: {{ permit_number }}
```

## Need More Variables?

If your template needs additional fields, you can:

1. Add them to the Pydantic models in `app/models/swppp.py`
2. Update the context preparation in `app/services/document_generator.py`
3. Use the new variables in your Word template

The system will automatically validate that all required fields are provided before generating the document.
