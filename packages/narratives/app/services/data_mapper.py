"""
Data Mapper Service

Responsible for converting raw AI-extracted data into strict Pydantic models
ready for document generation. Handles data cleaning, merging, and validation.
"""

import re
from datetime import date, datetime
from typing import Optional, Dict, Any

from app.models.swppp import (
    SWPPPData,
    ProjectInfo,
    PermitInfo,
    ContactInfo,
    SiteDetails
)
from app.models.swppp_variables import (
    EstimateExtraction,
    StormPlanExtraction,
    NOIExtraction
)

class SWPPPDataMapper:
    """
    Maps loose extraction data to strict SWPPPData models.
    """

    def __init__(self):
        self.default_state = "AZ" # Default to Arizona for this project context

    def merge_and_map(
        self, 
        estimate: Optional[EstimateExtraction] = None, 
        storm_plan: Optional[StormPlanExtraction] = None,
        noi: Optional[NOIExtraction] = None
    ) -> SWPPPData:
        """
        Merges data from multiple sources and returns a validated SWPPPData object.
        
        Strategy:
        - Storm Plan is authority for Site Metrics, Lat/Long, and Water info.
        - Estimate is authority for BMPs (future) and Project Name (often more specific).
        - NOI is authority for Permit Numbers and Dates.
        """
        
        # 1. Build Project Info
        # Storm plan usually has best address/coords
        project_name = (storm_plan.project_name if storm_plan and storm_plan.project_name else 
                       (estimate.job_name if estimate else "Unknown Project"))
        
        project_address = (storm_plan.project_address if storm_plan and storm_plan.project_address else 
                          (estimate.job_location if estimate else "Unknown Address"))
        
        # Cleanup address if it contains city/state
        # This is a basic cleanup, could be improved with an address parser
        
        project_info = ProjectInfo(
            project_name=project_name,
            project_address=project_address,
            city=storm_plan.city if storm_plan and storm_plan.city else "Unknown City",
            state=storm_plan.state if storm_plan and storm_plan.state else self.default_state,
            zip_code=self._clean_zip(storm_plan.zip_code) if storm_plan and storm_plan.zip_code else "00000",
            county=storm_plan.county if storm_plan and storm_plan.county else "Unknown County",
            latitude=storm_plan.latitude if storm_plan else None,
            longitude=storm_plan.longitude if storm_plan else None
        )

        # 2. Build Permit Info
        # Default dates if missing
        start_date = (noi.project_start_date if noi and noi.project_start_date else 
                     (estimate.estimate_date if estimate else date.today()))
        
        # Default end date to 6 months after start if missing
        end_date = (noi.project_end_date if noi and noi.project_end_date else 
                   date(start_date.year, start_date.month + 6, start_date.day) if start_date.month <= 6 else 
                   date(start_date.year + 1, start_date.month - 6, start_date.day))

        permit_info = PermitInfo(
            permit_number=noi.azpdes_number if noi and noi.azpdes_number else "PENDING",
            project_start_date=start_date,
            project_end_date=end_date,
            disturbed_area_acres=self._resolve_val(
                storm_plan.total_disturbed_area_acres if storm_plan else None, 
                1.0 # Default
            )
        )

        # 3. Build Site Details
        site_details = SiteDetails(
            intended_use_after=storm_plan.intended_use_after if storm_plan and storm_plan.intended_use_after else "Commercial Development",
            total_property_area_acres=self._resolve_val(
                storm_plan.site_area_acres if storm_plan else None, 
                1.0
            ),
            total_disturbed_area_acres=self._resolve_val(
                storm_plan.total_disturbed_area_acres if storm_plan else None, 
                1.0
            ),
            max_disturbed_area_one_time_acres=storm_plan.max_disturbed_area_one_time_acres if storm_plan else None,
            percent_impervious_before=self._resolve_val(
                storm_plan.percent_impervious_before if storm_plan else None, 
                0.0
            ),
            percent_impervious_after=self._resolve_val(
                storm_plan.percent_impervious_after if storm_plan else None, 
                100.0
            ),
            soil_type_description=storm_plan.soil_type_description if storm_plan and storm_plan.soil_type_description else "Native soil",
            
            # Defaults for now, could extract from NOI later
            is_tribal_land=False,
            is_federal_facility=False,
            has_unique_site_features=False,
            discharge_to_ms4=True if storm_plan and storm_plan.receiving_water and "MS4" in storm_plan.receiving_water else False
        )

        # 4. Build Contacts
        # Owner
        owner_name = storm_plan.owner if storm_plan and storm_plan.owner else "Owner"
        owner = ContactInfo(
            name=owner_name,
            company=owner_name, # Often same for corporate owners
            phone="000-000-0000", # Placeholder if missing
            email="owner@example.com"
        )
        
        # If we have client info in estimate, that might be the owner or contractor
        if estimate and estimate.client_company:
            # If extracting for a contractor (Desert Services), the client is likely the General Contractor
            pass

        # Contractor (The user of this tool, e.g., Desert Services or the Client in the estimate)
        # Assuming "Prepared By" is often the Contractor/Operator
        contractor = ContactInfo(
            name="Jayson Roti",
            company="Desert Services LLC",
            phone="480-513-8986",
            email="Jared@desertservices.net",
            address="P.O. Box 236",
            city="Scottsdale",
            state="AZ",
            zip_code="85252"
        )

        # QSP (Qualified SWPPP Practitioner) - Often same as preparer/contractor for this context
        qsp = ContactInfo(
            name="Jayson Roti",
            company="Desert Services LLC",
            title="QSP",
            phone="480-513-8986"
        )

        # 5. Construct Final Object
        return SWPPPData(
            project=project_info,
            permit=permit_info,
            site_details=site_details,
            owner=owner,
            contractor=contractor,
            qsp=qsp,
            swppp_prepared_date=date.today(),
            site_description=f"Construction of {project_name}",
            receiving_waters=storm_plan.receiving_water if storm_plan and storm_plan.receiving_water else "Municipal Storm Drain"
        )

    def _clean_zip(self, zip_str: str) -> str:
        """Extract first 5 digits of zip."""
        if not zip_str: return "00000"
        match = re.search(r'\d{5}', str(zip_str))
        return match.group(0) if match else "00000"

    def _resolve_val(self, val: Any, default: Any) -> Any:
        """Return value if truthy and not None, else default."""
        return val if val is not None else default
