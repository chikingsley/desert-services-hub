# Siteline API for 3rd Parties

Siteline makes use of a [GraphQL API](https://graphql.org/) to read and write all data between our frontend website and our backend infrastructure & database.

* *Base URL:** ``

- --

## Authentication

You will need to pass an API key as a `Bearer` token in the `Authorization` header for all requests. Please reach out to your Siteline account partner for this API key for your company.

```text
Authorization: Bearer <your token>

```text

- --

## Limitations

1. __Rate Limiting:__ We only allow 2 requests per second to the API. You will receive a 429 HTTP response if you exceed this limit.

2. __Cold Start:__ Due to our instances scaling down to 0, the first API call will take up to 20s. Subsequent calls should be less than 1s.

3. __Query Depth:__ We only allow GraphQL nested queries up to 4 levels deep. You will receive a 400 HTTP response if you exceed this limit.

__Example of valid query (4 levels deep):__

```graphql
query currentCompany {
  currentCompany {
    # level 1
    id
    users {
      # level 2
      company {
        # level 3
        users {
          # level 4
          id
        }
      }
    }
  }
}

```text

__Example of invalid query (5 levels deep — returns 400):__

```graphql
query currentCompany {
  currentCompany {
    # level 1
    id
    users {
      # level 2
      company {
        # level 3
        users {
          # level 4
          company {
            # level 5 -- this query is too deeply nested
            id
          }
        }
      }
    }
  }
}

```text

- --

## GraphQL API

The URL for our external API is: ``

For the full schema, please refer to the Siteline Schema documentation.
> 💡 We have a Postman workspace containing GraphQL calls for our API; please reach out to  for an invite.

__Walkthrough Video:__ <>

- --

## Example in NodeJS

```javascript
fetch("[api-external.siteline.com/graphql%22,](https://api-external.siteline.com/graphql",) {
  method: "POST",
  headers: {
    authorization: "Bearer <your token>",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    query: `
      query getCurrentCompany {
        currentCompany { id, name }
      }
    `
  })
});

```text

- --

## Queries

### 1. currentCompany

Use this as a testing query, mainly to make sure that you're authenticating correctly.

__Query:__

```graphql
query currentCompany {
  currentCompany {
    id
    name
  }
}

```text

__Response:__

```json
{
  "data": {
    "currentCompany": {
      "id": "60d45759-f8d4-4106-8858-0f02d2374a4a",
      "name": "Manheim Glass"
    }
  }
}

```text

- --

### 2. paginatedContracts

Retrieves a list of contracts on your company. You can provide filters to only get the ones you care about.
> ⚠️ __Note:__ This is subject to pagination. Provide the last contract ID as `cursor` to get the next 50 contracts.

__Query:__

```graphql
query paginatedContracts($input: GetPaginatedContractsInput!) {
  paginatedContracts(input: $input) {
    cursor
    hasNext
    contracts {
      id
      internalProjectNumber
      billingType
      percentComplete
      project {
        projectNumber
      }
      payApps {
        id
        billingStart
        billingEnd
        timeZone
        status
      }
    }
  }
}

```text

__Input:__

```json
{
  "input": {
    "month": "2023-04",
    "payAppStatus": "SUBMITTED_SYNCED_PAID",
    "contractStatus": "ACTIVE",
    "limit": 50,
    "cursor": null
  }
}

```text

__Response:__

```json
{
  "data": {
    "paginatedContracts": {
      "cursor": "7dcf6d35-935a-43bc-a833-c21c1612f343",
      "hasNext": true,
      "contracts": [
        {
          "id": "531dce87-8867-4a59-96e6-313b094a1687",
          "internalProjectNumber": "21030161",
          "billingType": "LUMP_SUM",
          "percentComplete": 1,
          "project": {
            "projectNumber": "029-393-08505"
          },
          "payApps": [
            {
              "id": "b8eb2ebf-14b5-46a3-9bed-9003b14d30d5",
              "billingStart": "2022-12-01T06:00:00.000Z",
              "billingEnd": "2023-01-01T05:59:59.999Z",
              "timeZone": "America/Chicago",
              "status": "PAID"
            }
          ]
        }
      ]
    }
  }
}

```text

- --

### 3. contract(id)

Retrieves the details for a single contract. You probably don't need this if you already selected the pay app IDs from the previous query.

__Query:__

```graphql
query contract($id: ID!) {
  contract(id: $id) {
    id
    payApps {
      id
    }
  }
}

```text

__Input:__

```json
{
  "id": "257ff7ac-dc3e-4a21-b209-6cadfe255a6d"
}

```text

__Response:__

```json
{
  "data": {
    "contract": {
      "id": "257ff7ac-dc3e-4a21-b209-6cadfe255a6d",
      "payApps": [
        { "id": "5b5164bd-16eb-48bd-96a7-45a3929d3e5d" },
        { "id": "6d88cdce-4c85-4829-abfe-c7809a054d16" },
        { "id": "1c932f65-d3f3-4884-a5a4-4564975b288b" }
      ]
    }
  }
}

```text

- --

### 4. payApp(id)

Retrieves details about a single pay app. Use this to get all of the current billing values on this pay app.

__Query:__

```graphql
query payApp($id: ID!) {
  payApp(id: $id) {
    id
    status
    billingStart
    billingEnd
    timeZone
    payAppNumber
    currentBilled
    currentRetention
    totalRetention
    previousRetentionBilled
    retentionOnly
    submittedAt
    progress {
      id
      progressBilled
      storedMaterialBilled
      totalValue
      sovLineItem {
        id
        code
        name
      }
    }
  }
}

```text

__Input:__

```json
{
  "id": "5514674b-a496-4fd8-987a-d5421b639ecc"
}

```text

__Response:__

```json
{
  "data": {
    "payApp": {
      "id": "5514674b-a496-4fd8-987a-d5421b639ecc",
      "status": "PROPOSED",
      "billingStart": "2023-03-01T06:00:00.000Z",
      "billingEnd": "2023-04-01T04:59:59.999Z",
      "timeZone": "America/Chicago",
      "payAppNumber": 1,
      "currentBilled": 563600,
      "currentRetention": 28180,
      "totalRetention": 28180,
      "previousRetentionBilled": 0,
      "retentionOnly": false,
      "submittedAt": "2023-03-21T20:39:46.083Z",
      "progress": [
        {
          "id": "fdaa7977-e8ef-40eb-a8c0-ab9070621d76",
          "progressBilled": 0,
          "storedMaterialBilled": 563600,
          "totalValue": 3506800,
          "sovLineItem": {
            "id": "ff3ffb87-5a7d-4040-b749-f0429999851b",
            "code": "1",
            "name": "Materials & Labor"
          }
        }
      ]
    }
  }
}

```text

- --

### 5. paginatedPayApps

Retrieves a paginated list of pay apps in your company. You can provide filters to only get the ones you care about.

__Query:__

```graphql
query paginatedPayApps($input: GetPaginatedPayAppsInput!) {
  paginatedPayApps(input: $input) {
    cursor
    hasNext
    payApps {
      id
      # ... additional fields as needed
    }
  }
}

```text

__Input:__

All fields in `input` are optional. If you don't provide a filter, all pay apps are returned (up to the pagination limit).

```json
{
  "input": {
    "status": "PROPOSED",
    "submittedInMonth": "2020-01",
    "paidInMonth": "2020-01",
    "limit": 50,
    "cursor": null
  }
}

```text

__Input Parameters:__

| Parameter | Description |
|-----------|-------------|
| `status` | Filter by status: `PROPOSED`, `PAID`, or `SYNCED` |
| `submittedInMonth` | Month in which the pay app was submitted (also includes syncing to a GC portal) |
| `paidInMonth` | Month in which the pay app was marked as paid |
| `limit` | Number of results per page (max 50) |
| `cursor` | Last pay app ID from previous fetch for pagination |

__Response:__

```json
{
  "data": {
    "paginatedPayApps": {
      "cursor": "7dcf6d35-935a-43bc-a833-c21c1612f343",
      "hasNext": true,
      "payApps": [
        {
          "id": "531dce87-8867-4a59-96e6-313b094a1687"
        }
      ]
    }
  }
}

```text

- --

## FAQ

__How do I know when a pay app was submitted?__

The value of `payApp.submittedAt` is set if the pay app is currently proposed (or synced to a GC portal, like Textura). Given that a pay app could be proposed/synced multiple times, it will return the *most recent* time that it was sent. If the pay app is in a draft state currently (but was proposed/synced in the past), this will return `null`.
