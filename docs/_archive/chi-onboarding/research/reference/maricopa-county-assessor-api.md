# Maricopa County Assessor's Office API Documentation

## Authentication

### Headers

- **AUTHORIZATION**: Your API token
- **user-agent**: null

To request a token, use the contact form on the website and select "API Question/Token".

### HTTP Response Codes

- `200 OK` - Request successful
- `201 Created` - Resource created successfully
- `204 No Content` - Successful with no response body
- `400 Bad Request` - Missing or invalid parameters
- `401 Unauthorized` - Authentication failed or insufficient permissions
- `403 Forbidden` - Access denied
- `404 Not Found` - Resource not found
- `405 Method Not Allowed` - Method not supported

## Base URL

All endpoints use the base URL: ``

- --

## Search Functions

### Search Property

Searches all data points and returns Real Property, BPP, MH, Rentals, Subdivisions, and Content.

```http
GET /search/property/?q={query}
GET /search/property/?q={query}&page={number}

```text

__Parameters:__

- `query` - URL encoded search string
- `page` - Page number (optional, 25 results per page)

### Search Subdivisions

Returns subdivision names and parcel counts.

```http
GET /search/sub/?q={query}

```text

### Search Rentals

Returns rental registrations only.

```http
GET /search/rental/?q={query}
GET /search/rental/?q={query}&page={number}

```text

- --

## Parcel Functions

### Parcel Details

Returns all available parcel data.

```http
GET /parcel/{apn}

```text

### Property Information

```http
GET /parcel/{apn}/propertyinfo

```text

### Property Address

```http
GET /parcel/{apn}/address

```text

### Valuation Details

Returns past 5 years of valuation data.

```http
GET /parcel/{apn}/valuations

```text

### Residential Details

Returns residential-specific data (not applicable to commercial/land/agriculture).

```http
GET /parcel/{apn}/residential-details

```text

### Owner Details

```http
GET /parcel/{apn}/owner-details

```text

### MCR Search

```http
GET /parcel/mcr/{mcr}
GET /parcel/mcr/{mcr}/?page={number}

```text

### Section/Township/Range (STR)

```http
GET /parcel/str/{str}
GET /parcel/str/{str}/?page={number}

```text

__Parameters:__

- `apn` - Assessor Parcel Number (with or without spaces, dashes, dots)
- `mcr` - MCR Number
- `str` - Section/Township/Range (can use dashes)
- `page` - Page number for paginated results (25 per page)

- --

## Map Functions

### Parcel Map

```http
GET /mapid/parcel/{apn}

```text

### Book/Map

```http
GET /mapid/bookmap/{book}/{map}

```text

### MCR Map

```http
GET /mapid/mcr/{mcr}

```text

__Parameters:__

- `book` - Three-digit book portion of APN
- `map` - Two-digit map portion of APN

Returns JSON array of map file names.

- --

## Business Personal Property & Mobile Home Functions

### BPP Account Details

```http
GET /bpp/{type}/{acct}
GET /bpp/{type}/{acct}/{year}

```text

__Parameters:__

- `type` - Account type (lowercase)

  - `c` - Commercial
  - `m` - Multiple
  - `l` - Lessor

- `acct` - Business personal property account number
- `year` - Four-digit tax year (optional, defaults to current)

### Mobile Home Account

```http
GET /mh/{acct}

```text

### Mobile Home VIN

```http
GET /mh/vin/{vin}

```text

- --

## Notes

- All endpoints return JSON responses
- Pagination: 25 results per page where applicable
- Parameters like subdivision names must be URL encoded
- Works with parcel types: Residential, Commercial, Land, Agriculture

* Last updated: February 1, 2024*
