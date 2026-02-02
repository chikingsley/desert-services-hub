# ServiceTitan vs CRO Software: API & Data Structure Comparison

## Overview

| Aspect | ServiceTitan | CRO Software |
|--------|--------------|--------------|
| **Primary Industry** | Home services (HVAC, plumbing, electrical) | Waste management, recycling, dumpster rental |
| **Company Size** | Enterprise (public company) | Mid-market (acquired by RapidWorks Oct 2025) |
| **API Version** | V2 (current) | OAuth 2.0 based |
| **Authentication** | OAuth 2.0 + Application Key + Tenant ID | OAuth 2.0 (Authorization Code + PKCE) |
| **Data Format** | JSON | JSON only |

---

## API Architecture Comparison

### ServiceTitan API Categories (16 modules)
1. Accounting
2. CRM
3. Dispatch
4. Equipment Systems
5. Inventory
6. Job Planning
7. Marketing
8. Memberships
9. Payroll
10. Pricebook
11. SalesTech
12. Scheduling Pro
13. Service Agreements
14. Settings
15. Task Management
16. Telecom

### CRO Software API Categories
1. Jobs
2. Customers
3. Drivers
4. Trucks/Assets
5. Routes
6. Locations
7. Tenants
8. Third Party Haulers
9. Webhooks
10. Reports

---

## Core Entity Comparison

### Customers

**ServiceTitan - Customer**
- `customerId` (Integer) - Unique identifier
- `name` (String)
- `address` (Object)
- `contacts[]` (Array) - Associated contacts
- `customFields` (Object) - Configurable fields
- `locations[]` (Array) - Service locations (1:many)
- `createdOn` (DateTime)
- `lastUpdatedOn` (DateTime)

**CRO Software - Customer**
- `customer_id` (Integer)
- `name` (String, 1-64 chars)
- `is_active` (Boolean) - Soft delete flag
- `is_commercial` (Boolean)
- `reference_number` (String)
- `parent_id` (Integer) - Parent customer
- `location_id` (Integer)
- `sales_rep_id` (Integer)
- `suspension_id` (Integer)
- `addresses[]` (Array) - Geographic/postal data
- `contacts[]` (Array) - With notification preferences
- `created_on` (ISO 8601)
- `last_updated_on` (ISO 8601)
- `renewal_date` (ISO 8601)

**Key Difference**: CRO has `is_commercial` flag and `parent_id` for customer hierarchies (common in waste management for multi-site businesses). ServiceTitan focuses on residential with custom fields.

---

### Locations/Job Sites

**ServiceTitan - Location**
- `locationId` (Integer)
- `address` (Object)
- `coordinates` (Object) - lat/lng
- `customerId` (Integer) - 1:1 relationship
- `contacts[]` (Array)
- `customFields` (Object)

**CRO Software - LocationAddressModel**
- `id` (Integer)
- `latitude` (Float, -90 to 90)
- `longitude` (Float, -180 to 180)
- `line_1` (String, 1-50 chars)
- `line_2` (String, optional)
- `line_3` (String, optional)
- `line_4` (String, optional)
- `locality` (String) - City
- `region` (String) - State
- `postcode` (String)

**Key Difference**: ServiceTitan has richer location metadata with custom fields. CRO uses a flatter address model optimized for delivery/pickup routing.

---

### Jobs/Work Orders

**ServiceTitan - Job**
- `jobId` (Integer)
- `locationId` (Integer)
- `customerId` (Integer) - Bill-to customer
- `status` (Enum) - Hold, Canceled, etc.
- `summary` (String)
- `businessUnit` (String)
- `jobType` (String)
- `appointments[]` (Array)
- `notes` (String)
- `holdReasons` (Array)
- `cancelReasons` (Array)
- `invoiceStatus` (Enum) - exported/posted
- `createdOn` (DateTime)
- `lastUpdatedOn` (DateTime)

**CRO Software - Job**
- `id` (Integer)
- `type` (Enum: D, E, L, P, R) - Physical action type
- `job_group_id` (Integer) - Group jobs
- `location_id` (Integer)
- `customer_id` (Integer)
- `requested_by` (Integer)
- `created_by` (Integer)
- `created_by_driver` (Boolean)
- `completed_by` (Integer)
- `schedule_date` (ISO 8601)
- `original_schedule_date` (ISO 8601)
- `desired_start_time` / `desired_end_time` (ISO 8601)
- `started_on` / `arrived_on` / `departed_on` (ISO 8601)
- `dispatched_on` (ISO 8601)
- `dumped_on` / `weighed_on` (ISO 8601)
- `truck_id` (Integer)
- `dispatch_priority` (Enum: H, L, M)
- `priority` (Integer, -999999 to -1)
- `is_completed` / `is_failed` / `is_declined` (Boolean)
- `is_acknowledged` / `is_deleted` / `is_paid` (Boolean)
- `dispatcher_notes` (String, max 2048)
- `driver_notes` (String, max 2048)
- `customer_notes` (String, max 2048)
- `invoice_notes` (String, max 2048)
- `flags` (String, max 64)
- `fail_reason` (String, max 64)
- `require_image` / `require_signature` (Boolean)
- `require_material` / `require_weights` (Boolean)
- `materials[]` (Array of JobMaterialModel)
- `scale_ticket` (String)
- `reference_number` (String)
- `third_party_hauler_id` (UUID)
- `add_to_routes` (CSV of route IDs)
- `images[]` (Array)
- `recur_enabled` / `recur_active` (Boolean)
- `times_failed` / `times_rolled_over` (Integer)

**Key Differences**:
- CRO jobs are **logistics-focused** with dump tracking, weigh-in times, scale tickets, material tracking
- ServiceTitan jobs are **service-focused** with appointments, estimates, invoices
- CRO has explicit `type` field (D=Delivery, E=Exchange, L=?, P=Pickup, R=?)
- CRO tracks driver actions granularly (arrived, departed, dumped, weighed)

---

### Appointments/Scheduling

**ServiceTitan - Appointment**
- `appointmentId` (Integer)
- `jobId` (Integer) - Parent job
- `appointmentNumber` (Integer)
- `start` (DateTime)
- `end` (DateTime)
- `arrivalWindowStart` (DateTime)
- `arrivalWindowEnd` (DateTime)
- `status` (Enum)
- `specialInstructions` (String)
- `assignedTechnicians[]` (Array)
- `projectId` (Integer, optional)

**CRO Software** - No dedicated appointment entity
- Jobs have `schedule_date`, `desired_start_time`, `desired_end_time`
- Jobs assigned directly to `truck_id`
- Routes manage scheduling via `add_to_routes`

**Key Difference**: ServiceTitan has a formal appointment entity for time windows and multiple technicians. CRO jobs are assigned to trucks/routes directly.

---

### Technicians/Drivers

**ServiceTitan - Technician**
- `technicianId` (Integer)
- Assignment status to appointments
- Dispatch status
- Arrival status

**CRO Software - DriverModel**
- `id` (Integer)
- `name` (String, 1-64 chars)
- `username` (String, 1-64 chars)
- `email` (String)
- `phone_number` (String, 7-15 chars)
- `address` / `city` / `state` / `zip` (Strings)
- `license_number` (String, 1-100 chars)
- `location_id` (Integer)
- `third_party_hauler_id` (UUID)
- `is_deactivated` (Boolean)
- `disable_shift_tracking` (Boolean)
- `can_create_requests` (Boolean)
- `can_edit_requests` (Boolean)
- `can_assign_to[]` (Array of truck_id)
- `can_dispatch_to[]` (Array of truck_id)
- `can_convert_to_group` (Boolean)
- `can_reposition_asset` (Boolean)

**Key Difference**: CRO has detailed driver permissions and truck assignments. ServiceTitan technicians are simpler with appointment-based assignment.

---

### Invoices/Billing

**ServiceTitan - Invoice Types**
- Job Invoices (auto-generated on booking)
- Membership Invoices (sales/billing/service/refund)
- Point of Sale Invoices
- Project Invoices
- Financing Invoices

**ServiceTitan Invoice Fields**
- `workLocation` (Object)
- `customer` (Object)
- `servicesGoodsSold` (Array)
- `paymentAmount` (Decimal)
- `glAccountMapping` (Object)

**CRO Software** - Invoice referenced but details not in public API docs
- Jobs have `is_paid` flag
- `invoice_notes` field on jobs
- Integration with QuickBooks for billing

**Key Difference**: ServiceTitan has comprehensive invoice types for different scenarios. CRO relies more on accounting integrations.

---

### Pricebook/Pricing

**ServiceTitan - Pricebook**
- **Services** - Labor tasks (e.g., "Replace capacitor")
  - Description, labor hours, pricing tiers
  - Linked materials and equipment
- **Materials** - Parts used (e.g., capacitor)
  - Units, costs, images, warranty
- **Equipment** - Large installed items (e.g., furnace)
  - Install dates, replacement tracking
- **Categories** - Organization structure

**CRO Software** - No public pricebook API
- Pricing managed internally
- Jobs have `materials[]` array with JobMaterialModel

**Key Difference**: ServiceTitan has a sophisticated pricebook system for field quoting. CRO focuses on job-based material tracking for waste/recycling.

---

### Estimates/Quotes

**ServiceTitan - Estimate**
- `status` (Enum: Sold, Dismissed, Open)
- `soldBy` (Integer) - Technician ID
- `totalAmount` (Decimal)
- `soldOnDate` (DateTime)
- `jobId` (Integer)
- Contains services, materials, equipment items

**CRO Software** - No dedicated estimate entity
- Focus is on recurring service scheduling
- Pricing typically contract-based

**Key Difference**: ServiceTitan is built for on-site quoting and sales. CRO is built for scheduled pickups/deliveries with contract pricing.

---

### Assets/Equipment

**ServiceTitan - Equipment Systems**
- Installed equipment tracking
- Replacement opportunities
- Install dates and warranty

**CRO Software - Assets**
- `asset_id` (Integer)
- `asset_type_id` (Integer)
- `asset_quantity` (Integer) - For clusters
- `asset_dropped_id` (Integer) - DeployedBinID
- `desired_asset_desc` (String)

Asset-related job fields:
- `dump_location_id` - Where asset was dumped
- `scale_ticket` - Weight ticket
- `require_weights` - Weight entry required

**Key Difference**: ServiceTitan tracks installed home equipment. CRO tracks dumpsters, bins, and containers as deployable/retrievable assets.

---

### Routes/Dispatch

**ServiceTitan**
- Dispatch module for scheduling
- Scheduling Pro for advanced routing
- Appointment-based assignment

**CRO Software**
- `add_to_routes` (CSV of route IDs)
- `dispatched_by_route` (Integer)
- `merged_with_route_id` (Integer)
- Route zones for automatic routing
- GPS tracking integration

**Key Difference**: CRO has dedicated route optimization for pickup/delivery. ServiceTitan focuses on appointment windows for service calls.

---

## Multi-Tenancy & Organization

**ServiceTitan**
- `tenantId` - Organization identifier
- Business Units within tenant
- Single-tenant per customer

**CRO Software - TenantModel**
- `id` (Integer)
- `code` (String) - Facility identifier
- `name` (String, 1-64 chars)
- `address` / `city` / `state` / `zip` (Strings)
- `email` (String)
- `phone` (String)
- `is_active` (Boolean)
- `truck_limit` (Integer) - Max trucks
- `created_on` (ISO 8601)

**Key Difference**: CRO has explicit truck limits per tenant, reflecting fleet-based operations.

---

## Third-Party Integrations

**ServiceTitan**
- Marketing platforms
- Accounting systems
- Telecom (call tracking)

**CRO Software**
- QuickBooks Desktop/Online
- Compology (container monitoring)
- Geotab (fleet telematics)
- Third Party Haulers API
  - `third_party_hauler_id` (UUID)
  - `CreateHaulerConnectionRequestModel`
  - `ThirdPartyHaulerListModel`

**Key Difference**: CRO has native support for subcontractor haulers, critical for waste management overflow.

---

## Role-Based Access

**ServiceTitan**
- Not detailed in public docs
- Tenant-level admin controls

**CRO Software Roles**
- Public
- Admin
- Driver
- Dispatcher
- CrmUser
- ThirdPartyDispatcher
- ThirdPartyDriver
- ThirdPartyAdmin
- ThirdPartyCrmUser

**Key Difference**: CRO has explicit third-party roles for subcontractor access.

---

## Webhooks

**ServiceTitan**
- V2 webhooks (in development)
- Event subscriptions for real-time updates

**CRO Software**
- `UpdateWebhookModel` documented
- Webhook management via API

---

## Summary: Key Architectural Differences

| Concept | ServiceTitan Approach | CRO Software Approach |
|---------|----------------------|----------------------|
| **Core Unit** | Service call with appointments | Job with pickup/delivery actions |
| **Scheduling** | Time windows + technician assignment | Route-based + truck assignment |
| **Pricing** | On-site estimates from pricebook | Contract-based recurring |
| **Assets** | Installed equipment (HVAC, etc.) | Deployable containers (dumpsters) |
| **Tracking** | Job completion + invoice | Pickup/delivery + weigh-in |
| **Invoicing** | Multiple invoice types | QuickBooks integration |
| **Workforce** | Technicians with skills | Drivers with truck assignments |
| **Subcontractors** | Not emphasized | First-class third-party hauler support |

---

## Data Model Relationship Diagrams

### ServiceTitan
```
Customer (1) ──> (*) Locations
Location (1) ──> (*) Jobs
Job (1) ──> (*) Appointments
Job (1) ──> (*) Estimates
Job (1) ──> (1) Invoice
Appointment (*) ──> (*) Technicians
Pricebook Service (*) ──> (*) Materials
Pricebook Service (*) ──> (*) Equipment
```

### CRO Software
```
Tenant (1) ──> (*) Locations
Tenant (1) ──> (*) Trucks
Tenant (1) ──> (*) Drivers
Customer (1) ──> (*) Locations
Location (1) ──> (*) Jobs
Job (*) ──> (1) Truck
Job (*) ──> (*) Routes
Job (1) ──> (*) Materials
Driver (*) ──> (*) Trucks (can_assign_to)
Third Party Hauler (1) ──> (*) Jobs
```

---

## Sources

### ServiceTitan
- [Developer Portal](https://developer.servicetitan.io/)
- [API List](https://developer.servicetitan.io/apis/)
- [CRM Documentation](https://developer.servicetitan.io/docs/api-resources-crm/)
- [Job Planning Documentation](https://developer.servicetitan.io/docs/api-resources-job-planning/)
- [Accounting Documentation](https://developer.servicetitan.io/docs/api-resources-accounting/)
- [Pricebook Documentation](https://developer.servicetitan.io/docs/api-resources-pricebook/)
- [Sales & Estimates Documentation](https://developer.servicetitan.io/docs/api-resources-salestech/)

### CRO Software
- [Developer API Documentation](https://docs.crosoftware.net/)
- [Getting Started Guide](https://docs.crosoftware.net/docs/)
- [Authentication Guide](https://docs.crosoftware.net/docs/authentication_guide/)
- [DriverModel](https://docs.crosoftware.net/docs/data_types/DriverModel/)
- [Get Job Endpoint](https://docs.crosoftware.net/docs/requests/jobs_get_job/)
- [CRO Software Website](https://crosoftware.com/)
