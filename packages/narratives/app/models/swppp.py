"""Pydantic models for SWPPP (Stormwater Pollution Prevention Plan) data validation."""

from datetime import date
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class ProjectInfo(BaseModel):
    """Project identification and location information."""

    project_name: str = Field(..., min_length=1, description="Project name")
    project_address: str = Field(..., min_length=1, description="Project site address")
    city: str = Field(..., min_length=1)
    state: str = Field(..., min_length=2, max_length=2, description="Two-letter state code")
    zip_code: str = Field(..., pattern=r"^\d{5}(-\d{4})?$", description="ZIP code")
    county: str

    # Optional fields
    apn: Optional[str] = Field(None, description="Assessor Parcel Number")
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)

    @field_validator("state")
    @classmethod
    def validate_state_uppercase(cls, v: str) -> str:
        """Ensure state code is uppercase."""
        return v.upper()


class PermitInfo(BaseModel):
    """Construction permit information."""

    permit_number: str = Field(..., min_length=1, description="NPDES/State permit number")
    wdid: Optional[str] = Field(None, description="Waste Discharge Identification number")
    permit_issue_date: Optional[date] = None
    project_start_date: date
    project_end_date: date
    disturbed_area_acres: float = Field(..., gt=0, description="Total area of disturbance in acres")

    @field_validator("project_end_date")
    @classmethod
    def validate_end_after_start(cls, v: date, info) -> date:
        """Ensure project end date is after start date."""
        if "project_start_date" in info.data and v < info.data["project_start_date"]:
            raise ValueError("Project end date must be after start date")
        return v


class ContactInfo(BaseModel):
    """Contact information for project personnel."""

    name: str = Field(..., min_length=1)
    company: str = Field(..., min_length=1)
    phone: Optional[str] = Field(None, pattern=r"^[\d\+\-\(\)\s]{10,20}$", description="Phone number")
    email: Optional[str] = Field(None, pattern=r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")

    # Optional fields
    title: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    area_of_control: Optional[str] = None
    cell_phone: Optional[str] = Field(None, pattern=r"^[\d\+\-\(\)\s]{10,20}$")
    emergency_phone: Optional[str] = Field(None, pattern=r"^[\d\+\-\(\)\s]{10,20}$")


class SiteDetails(BaseModel):
    """Detailed site characteristics and measurements."""
    
    intended_use_after: str = Field(..., description="Intended use of site after construction")
    total_property_area_acres: float = Field(..., gt=0, description="Total size of property in acres")
    total_disturbed_area_acres: float = Field(..., gt=0, description="Total area to be disturbed in acres")
    max_disturbed_area_one_time_acres: Optional[float] = Field(None, description="Max area disturbed at one time")
    percent_impervious_before: float = Field(..., ge=0, le=100, description="Percent impervious before construction")
    percent_impervious_after: float = Field(..., ge=0, le=100, description="Percent impervious after construction")
    soil_type_description: str = Field(..., description="Description of soil types and erosion potential")
    
    # Checkboxes/Booleans
    is_tribal_land: bool = Field(default=False)
    is_federal_facility: bool = Field(default=False)
    has_unique_site_features: bool = Field(default=False)
    discharge_to_ms4: bool = Field(default=False)


class SWPPPData(BaseModel):
    """
    Complete SWPPP document data model.

    This model validates all required information before generating the SWPPP document.
    Missing or invalid data will raise validation errors with clear messages.
    """

    # Core project information
    project: ProjectInfo
    permit: PermitInfo
    site_details: SiteDetails

    # Key contacts
    owner: ContactInfo = Field(..., description="Property owner contact")
    contractor: ContactInfo = Field(..., description="General contractor contact")
    qsp: ContactInfo = Field(..., description="Qualified SWPPP Practitioner contact")

    # Additional contacts (Optional)
    operator: Optional[ContactInfo] = Field(None, description="Operator contact if different from owner")
    emergency_contact: Optional[ContactInfo] = Field(None, description="Emergency 24-Hour Contact")
    site_supervisor: Optional[ContactInfo] = Field(None, description="Site Supervisor")
    subcontractor: Optional[ContactInfo] = Field(None, description="Subcontractor")
    swppp_preparer: Optional[ContactInfo] = Field(None, description="SWPPP Prepared By")

    # Document metadata
    swppp_prepared_date: date
    swppp_revision: int = Field(default=1, ge=1, description="SWPPP revision number")

    # Additional site info
    site_description: str = Field(..., min_length=10, description="Description of construction activities")
    receiving_waters: str = Field(..., description="Receiving water bodies")

    class Config:
        """Pydantic model configuration."""
        json_schema_extra = {
            "example": {
                "project": {
                    "project_name": "Main Street Shopping Center",
                    "project_address": "123 Main St",
                    "city": "Sacramento",
                    "state": "CA",
                    "zip_code": "95814",
                    "county": "Sacramento"
                },
                "permit": {
                    "permit_number": "CAS000002",
                    "project_start_date": "2025-01-15",
                    "project_end_date": "2025-12-31",
                    "disturbed_area_acres": 5.2
                },
                "owner": {
                    "name": "John Smith",
                    "title": "Project Manager",
                    "company": "ABC Development",
                    "phone": "9165551234",
                    "email": "jsmith@abcdev.com"
                },
                "contractor": {
                    "name": "Jane Doe",
                    "title": "Site Superintendent",
                    "company": "XYZ Construction",
                    "phone": "9165555678",
                    "email": "jdoe@xyzconstruction.com"
                },
                "qsp": {
                    "name": "Bob Johnson",
                    "title": "QSP",
                    "company": "Environmental Services Inc",
                    "phone": "9165559999",
                    "email": "bjohnson@envservices.com"
                },
                "swppp_prepared_date": "2025-01-10",
                "site_description": "Construction of a new shopping center with parking lot",
                "receiving_waters": "Morrison Creek"
            }
        }
