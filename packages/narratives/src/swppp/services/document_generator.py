"""Service for generating SWPPP documents from templates."""

from pathlib import Path
from typing import Dict, Any

from docxtpl import DocxTemplate

from swppp.models.swppp import SWPPPData


class DocumentGenerator:
    """Handles document generation from Word templates."""

    def __init__(self, template_path: Path):
        """
        Initialize the document generator.

        Args:
            template_path: Path to the Word template file (.docx)

        Raises:
            FileNotFoundError: If template file doesn't exist
        """
        if not template_path.exists():
            raise FileNotFoundError(f"Template not found: {template_path}")

        self.template_path = template_path

    def generate_swppp(self, data: SWPPPData, output_path: Path) -> Path:
        """
        Generate a SWPPP document from validated data.

        Args:
            data: Validated SWPPP data (Pydantic ensures all required fields are present)
            output_path: Where to save the generated document

        Returns:
            Path to the generated document
        """
        # Load the template
        doc = DocxTemplate(self.template_path)

        # Convert Pydantic model to dict for template rendering
        context = self._prepare_context(data)

        # Render the template with the data
        doc.render(context)

        # Save the generated document
        output_path.parent.mkdir(parents=True, exist_ok=True)
        doc.save(output_path)

        return output_path

    def _prepare_context(self, data: SWPPPData) -> Dict[str, Any]:
        """
        Prepare template context from SWPPP data.

        Converts nested Pydantic models to a flat dict structure
        that's easier to use in Word templates.

        Args:
            data: Validated SWPPP data

        Returns:
            Dictionary with template variables
        """
        # Basic project info
        context = {
            "project_name": data.project.project_name,
            "project_address": data.project.project_address,
            "city": data.project.city,
            "state": data.project.state,
            "zip_code": data.project.zip_code,
            "county": data.project.county,
            "latitude": data.project.latitude,
            "longitude": data.project.longitude,
            "permit_number": data.permit.permit_number,
            "project_start_date": data.permit.project_start_date,
            "project_end_date": data.permit.project_end_date,
            "swppp_prepared_date": data.swppp_prepared_date,
            "site_description": data.site_description,
            "receiving_waters": data.receiving_waters,
            # Site Details
            "total_property_area": data.site_details.total_property_area_acres,
            "total_disturbed_area": data.site_details.total_disturbed_area_acres,
            "max_disturbed_area": data.site_details.max_disturbed_area_one_time_acres or data.site_details.total_disturbed_area_acres,
            "impervious_before": data.site_details.percent_impervious_before,
            "impervious_after": data.site_details.percent_impervious_after,
            "intended_use_after": data.site_details.intended_use_after,
            "soil_type_description": data.site_details.soil_type_description,
        }

        # Helper to add contact info with prefix
        def add_contact(contact, prefix):
            if not contact:
                return
            context.update({
                f"{prefix}_name": contact.name,
                f"{prefix}_company": contact.company,
                f"{prefix}_phone": contact.phone or "",
                f"{prefix}_email": contact.email or "",
                f"{prefix}_address": contact.address or "",
                f"{prefix}_city": contact.city or "",
                f"{prefix}_state": contact.state or "",
                f"{prefix}_zip": contact.zip_code or "",
                f"{prefix}_city_state_zip": f"{contact.city or ''}, {contact.state or ''} {contact.zip_code or ''}".strip(", "),
            })

        # Helper for checkbox characters (☑ / ☐)
        def _get_checkbox(is_checked: bool) -> str:
            return "☑" if is_checked else "☐"

        # Add checkbox fields to context
        context.update({
            "is_tribal_land_check": _get_checkbox(data.site_details.is_tribal_land),
            "is_federal_facility_check": _get_checkbox(data.site_details.is_federal_facility),
            "has_unique_features_check": _get_checkbox(data.site_details.has_unique_site_features),
            "discharge_to_ms4_check": _get_checkbox(data.site_details.discharge_to_ms4),
        })

        # Add all contacts
        add_contact(data.owner, "owner")
        add_contact(data.contractor, "contractor")
        add_contact(data.qsp, "qsp")
        add_contact(data.operator, "operator")
        add_contact(data.emergency_contact, "emergency")
        add_contact(data.site_supervisor, "supervisor")
        add_contact(data.subcontractor, "subcontractor")
        add_contact(data.swppp_preparer, "preparer")

        return context