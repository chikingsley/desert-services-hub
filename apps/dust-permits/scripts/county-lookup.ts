#!/usr/bin/env bun

import { handleMaricopaLookup } from "../src/api/maricopa";
import { handlePimaLookup } from "../src/api/pima";

interface CliOptions {
  address?: string;
  coordinates?: string;
  county?: string;
  identifier?: string;
  includeGeometry: boolean;
  parcel?: string;
}

function usage(): never {
  console.error(
    [
      "Usage:",
      "  bun apps/dust-permits/scripts/county-lookup.ts --county <pima|maricopa> [one lookup mode]",
      "",
      "Lookup modes:",
      "  --identifier <AZDEQ/LTF>",
      "  --address <street address>",
      "  --parcel <parcel/apn>",
      "  --coordinates <lat,lng>",
      "",
      "Flags:",
      "  --include-geometry",
      "",
      "Examples:",
      "  just pima-lookup identifier 114964",
      "  just maricopa-lookup address \"16155 W Elwood St\"",
      "  just county-lookup pima coordinates \"32.159457,-110.842543\"",
    ].join("\n")
  );
  process.exit(1);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    includeGeometry: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--county":
        options.county = argv[index + 1];
        index += 1;
        break;
      case "--identifier":
        options.identifier = argv[index + 1];
        index += 1;
        break;
      case "--address":
        options.address = argv[index + 1];
        index += 1;
        break;
      case "--parcel":
        options.parcel = argv[index + 1];
        index += 1;
        break;
      case "--coordinates":
        options.coordinates = argv[index + 1];
        index += 1;
        break;
      case "--include-geometry":
        options.includeGeometry = true;
        break;
      case "--help":
      case "-h":
        usage();
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        usage();
    }
  }

  return options;
}

function parseCoordinates(value: string): { latitude: number; longitude: number } {
  const [latitudeRaw, longitudeRaw] = value.split(",", 2);
  const latitude = Number.parseFloat(latitudeRaw ?? "");
  const longitude = Number.parseFloat(longitudeRaw ?? "");

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error(
      `Invalid --coordinates value "${value}". Expected "lat,lng".`
    );
  }

  return { latitude, longitude };
}

const options = parseArgs(Bun.argv.slice(2));

if (!options.county) {
  console.error("--county is required");
  usage();
}

const payload: Record<string, unknown> = {
  includeGeometry: options.includeGeometry,
};

const lookupModeCount =
  Number(Boolean(options.identifier)) +
  Number(Boolean(options.address)) +
  Number(Boolean(options.parcel)) +
  Number(Boolean(options.coordinates));

if (lookupModeCount !== 1) {
  console.error(
    "Provide exactly one lookup mode: --identifier, --address, --parcel, or --coordinates"
  );
  usage();
}

if (options.identifier) {
  payload.identifier = options.identifier;
}
if (options.address) {
  payload.address = options.address;
}
if (options.parcel) {
  payload.parcel = options.parcel;
}
if (options.coordinates) {
  Object.assign(payload, parseCoordinates(options.coordinates));
}

const county = options.county.trim().toLowerCase();
const response =
  county === "pima"
    ? await handlePimaLookup(payload)
    : county === "maricopa"
      ? await handleMaricopaLookup(payload)
      : (() => {
          throw new Error(`Unsupported county "${options.county}"`);
        })();

const data = await response.json();
console.log(JSON.stringify(data, null, 2));

if (!response.ok) {
  process.exit(1);
}
