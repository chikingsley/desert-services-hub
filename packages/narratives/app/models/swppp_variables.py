"""
SWPPP Variables Schema

This defines the complete set of variables needed to fill a CGP SWPPP template.
Data is extracted from multiple source documents and combined into this structure.
"""

from datetime import date
from typing import Optional, List
from pydantic import BaseModel, Field


class ProjectLocation(BaseModel):
    """Project location and identification."""

    project_name: str = Field(..., description="Official project name")
    street_address: str = Field(..., description="Street address or location")
    city: str
    state: str = Field(..., min_length=2, max_length=2, description="2-letter state code")
    zip_code: str = Field(..., pattern=r"^\d{5}(-\d{4})?$")
    county: str

    # Coordinates
    latitude: float = Field(..., description="Decimal degrees to 6 places")
    longitude: float = Field(..., description="Decimal degrees to 6 places")
    lat_long_method: str = Field(
        default="GPS",
        description="Method: USGS, EPA, ADEQ, GPS, or Other"
    )

    # Optional site phone
    site_phone: Optional[str] = None


class Contact(BaseModel):
    """Contact information for a person/company."""

    company: str = Field(..., description="Company or organization name")
    contact_name: str = Field(..., description="Primary contact person")
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    phone: str
    email: Optional[str] = None
    fax: Optional[str] = None


class Operator(Contact):
    """
    Construction operator information.

    Can have multiple operators on a site, each with area of control.
    """

    area_of_control: Optional[str] = Field(
        None,
        description="Description of operator's area of responsibility"
    )


class SiteMetrics(BaseModel):
    """Site size and disturbance metrics."""

    total_property_acres: float = Field(..., gt=0, description="Total site size in acres")
    total_disturbance_acres: float = Field(..., gt=0, description="Total area to be disturbed")
    max_disturbance_at_once_acres: float = Field(
        ...,
        gt=0,
        description="Maximum area disturbed at any one time"
    )

    # Optional impervious calculations
    percent_impervious_before: Optional[float] = Field(None, ge=0, le=100)
    percent_impervious_after: Optional[float] = Field(None, ge=0, le=100)


class ReceivingWater(BaseModel):
    """Information about receiving waters."""

    name: str = Field(..., description="Name of receiving water body")
    discharges_to_ms4: bool = Field(default=False, description="Discharges to MS4?")
    ms4_owner: Optional[str] = Field(None, description="MS4 owner if applicable")

    # Impaired water info
    is_impaired: bool = Field(default=False)
    impairment_pollutants: Optional[str] = None
    has_tmdl: Optional[bool] = None

    # Outstanding Arizona Water
    is_oaw: bool = Field(default=False, description="Is Outstanding Arizona Water?")
    within_quarter_mile_impaired_oaw: bool = Field(
        default=False,
        description="Within 1/4 mile upstream of impaired water or OAW?"
    )


class BMP(BaseModel):
    """Best Management Practice."""

    code: Optional[str] = Field(None, description="BMP code (e.g., EC-7, ASPC-5)")
    name: str = Field(..., description="BMP name/description")
    description: str = Field(..., description="Full description of BMP")
    quantity: Optional[str] = Field(None, description="Quantity and unit (e.g., '2,355 LF')")
    installation_schedule: Optional[str] = Field(None, description="When BMP will be installed")
    is_temporary: bool = Field(default=True, description="Temporary or permanent BMP")
    responsible_party: Optional[str] = Field(None, description="Person/company responsible")

    class Config:
        json_schema_extra = {
            "example": {
                "code": "ASPC-5",
                "name": "Compost Filter Sock",
                "description": "Installation of 9\" Compost Filter Sock (EPA approved equal to silt fence)",
                "quantity": "2,355 LF",
                "installation_schedule": "At the onset of construction",
                "is_temporary": True,
                "responsible_party": "41 North Contractors, LLC – Eddie Bersi"
            }
        }


class ConstructionPhase(BaseModel):
    """Construction activity phase."""

    phase_number: int
    description: str = Field(..., description="Description of activities in this phase")
    estimated_start: Optional[date] = None
    estimated_end: Optional[date] = None
    bmps_for_phase: List[str] = Field(
        default_factory=list,
        description="List of BMP codes applicable to this phase"
    )


class EnvironmentalInfo(BaseModel):
    """Environmental review information."""

    # Endangered species
    endangered_species_present: bool = Field(default=False)
    endangered_species_method: Optional[str] = Field(
        None,
        description="How determination was made (e.g., 'Arizona Environmental Review Tool')"
    )
    endangered_species_list: List[str] = Field(
        default_factory=list,
        description="List of species present (e.g., 'Monarch', 'Sonoran Desert Tortoise')"
    )

    # Historic preservation
    historic_sites_present: bool = Field(default=False)
    historic_sites_method: Optional[str] = None
    historic_sites_description: Optional[str] = None


class SWPPPVariables(BaseModel):
    """
    Complete set of variables needed to generate a CGP SWPPP.

    This schema is populated from multiple source documents:
    - Estimate (Desert Services)
    - Storm Management Plan (engineering drawings)
    - NOI document
    - Dust Permit
    - PM tool data
    - Manual entry
    """

    # ===== COVER PAGE =====

    project_location: ProjectLocation

    # Prepared For (client/owner)
    prepared_for: Contact

    # Prepared By (always Desert Services, but allow override)
    prepared_by: Contact = Field(
        default=Contact(
            company="Desert Services LLC",
            contact_name="Jayson Roti",
            address="P.O. Box 236",
            city="Scottsdale",
            state="AZ",
            zip_code="85252",
            phone="480-513-8986",
            fax="480-657-2057",
            email="Jared@desertservices.net"
        )
    )

    # Dates
    swppp_preparation_date: date = Field(default_factory=date.today)
    project_start_date: date
    project_completion_date: date

    # ===== SECTION 1: CONTACTS =====

    operators: List[Operator] = Field(..., min_items=1, description="Construction operator(s)")

    # 24-hour emergency contact
    emergency_contact_name: str
    emergency_contact_phone: str

    # Stormwater team (optional but recommended)
    stormwater_team_lead: Optional[Contact] = None

    # ===== SECTION 2: SITE INFORMATION =====

    # Function of construction
    construction_function: str = Field(
        ...,
        description="Residential, Commercial, Industrial, Road Construction, Linear Utility, or Other"
    )

    # Site metrics
    site_metrics: SiteMetrics

    # Soils and site conditions
    soil_type: str = Field(..., description="Soil type (e.g., 'Valencia sandy loam')")
    slopes_description: Optional[str] = Field(None, description="Description of slopes on site")
    drainage_patterns: Optional[str] = Field(None, description="Current drainage patterns")

    # Intended use
    intended_use_after_completion: str = Field(
        ...,
        description="Intended use after construction (e.g., 'Retail / Restaurants')"
    )

    # Receiving waters
    receiving_waters: List[ReceivingWater] = Field(..., min_items=1)

    # Municipality
    municipality_received_authorization: bool = Field(default=False)
    municipality_name: Optional[str] = None

    # Environmental
    environmental_info: EnvironmentalInfo = Field(default_factory=EnvironmentalInfo)

    # Other permits
    other_permits: List[str] = Field(
        default_factory=list,
        description="List of other permits (grading, dust control, etc.)"
    )

    # ===== SECTION 2.4: CONSTRUCTION SEQUENCE =====

    construction_phases: List[ConstructionPhase] = Field(
        default_factory=list,
        description="Phases of construction activity"
    )

    # ===== SECTION 3: BMPs =====

    bmps: List[BMP] = Field(..., min_items=1, description="All BMPs for the project")

    # ===== SECTION 5: INSPECTIONS =====

    inspector_name: str = Field(..., description="Person responsible for inspections")
    inspection_frequency: str = Field(
        default="Every 14 days and after every rain event of 0.50 inches or more",
        description="Inspection schedule"
    )

    # ===== AZPDES PERMIT INFO =====

    azpdes_permit_number: Optional[str] = Field(
        None,
        description="AZPDES permit tracking number (assigned after NOI submission)"
    )

    # ===== ADDITIONAL INFO =====

    site_description_narrative: Optional[str] = Field(
        None,
        description="Detailed narrative description of construction activities"
    )

    buffer_areas_unfeasible: Optional[str] = Field(
        None,
        description="Areas where 50-ft buffer is unfeasible"
    )

    material_storage_areas: Optional[str] = Field(
        None,
        description="Description of material storage areas"
    )

    class Config:
        json_schema_extra = {
            "title": "SWPPP Variables",
            "description": "Complete data model for CGP SWPPP generation"
        }


# Separate schema for extraction results from individual documents
class EstimateExtraction(BaseModel):
    """Data extracted from Desert Services estimate."""

    # Client info (becomes prepared_for)
    client_company: Optional[str] = None
    client_contact: Optional[str] = None
    client_address: Optional[str] = None
    client_phone: Optional[str] = None

    # Project info
    job_name: Optional[str] = None
    job_location: Optional[str] = None

    # Estimator (might be inspector)
    estimator_name: Optional[str] = None

    # Estimate details
    estimate_number: Optional[str] = None
    estimate_date: Optional[date] = None

    # BMPs from line items
    bmps_found: List[BMP] = Field(default_factory=list)

    # Inspection schedule (if mentioned)
    inspection_schedule: Optional[str] = None


class StormPlanExtraction(BaseModel):
    """Data extracted from Storm Management Plan."""

    # Project identification
    project_name: Optional[str] = None
    project_address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None

    # Location
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    county: Optional[str] = None

    # Site metrics
    site_area_acres: Optional[float] = None
    total_disturbed_area_acres: Optional[float] = None
    max_disturbed_area_one_time_acres: Optional[float] = None
    building_area_sf: Optional[float] = None
    parking_spaces: Optional[int] = None
    
    # Imperviousness
    percent_impervious_before: Optional[float] = None
    percent_impervious_after: Optional[float] = None
    
    # Site details
    intended_use_after: Optional[str] = None
    soil_type_description: Optional[str] = None
    slopes_description: Optional[str] = None

    # Water info
    receiving_water: Optional[str] = None
    storm_sewer_systems: Optional[str] = None
    flood_zone: Optional[str] = None

    # Engineers/consultants
    civil_engineer_company: Optional[str] = None
    civil_engineer_contact: Optional[str] = None

    # Developer/owner
    developer: Optional[str] = None
    owner: Optional[str] = None


class NOIExtraction(BaseModel):
    """Data extracted from NOI document."""

    azpdes_number: Optional[str] = None
    project_start_date: Optional[date] = None
    project_end_date: Optional[date] = None
    endangered_species_info: Optional[dict] = None
    historic_preservation_info: Optional[dict] = None
