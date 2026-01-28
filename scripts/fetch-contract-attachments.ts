import { GraphEmailClient } from "../services/email/client";

const azureTenantId = process.env.AZURE_TENANT_ID;
const azureClientId = process.env.AZURE_CLIENT_ID;
const azureClientSecret = process.env.AZURE_CLIENT_SECRET;

if (!(azureTenantId && azureClientId && azureClientSecret)) {
  console.error("Missing Azure credentials");
  process.exit(1);
}

const client = new GraphEmailClient({
  azureTenantId,
  azureClientId,
  azureClientSecret,
});

await client.initAppAuth();

// Edison/Linear Park Contract
console.log("Downloading Edison/Linear Park contract...");
const edisonContract = await client.downloadAttachment(
  "kerin@desertservices.net",
  "AAMkADY0OWRkMGJkLWYwZDYtNGFlMC1hMmRiLWI0NjFhZjM5ZjlkMABGAAAAAABr_Irf3Q1iSqgsHjyPWhNxBwCE-k-HL_AtQb4ukDPHbvmQAAJcnseoAACE-k-HL_AtQb4ukDPHbvmQAAbe9jlyAAA=",
  "AAMkADY0OWRkMGJkLWYwZDYtNGFlMC1hMmRiLWI0NjFhZjM5ZjlkMABGAAAAAABr_Irf3Q1iSqgsHjyPWhNxBwCE-k-HL_AtQb4ukDPHbvmQAAJcnseoAACE-k-HL_AtQb4ukDPHbvmQAAbe9jlyAAABEgAQAMSd8B9LI45Ntou5psONo5o="
);
await Bun.write(
  "services/contract/ground-truth/edison-linear-parks/Contract_Package_Edison_and_Linear_Park.pdf",
  edisonContract
);
console.log("Saved Edison/Linear contract");

// OneAZ PO 2
console.log("Downloading OneAZ PO 2...");
const oneazPO = await client.downloadAttachment(
  "kendra@desertservices.net",
  "AAMkADE0ZDI1YjEyLWZhYWItNGEzNi1iNjc2LTRlMjljYTA4MDlkZQBGAAAAAAAnkX2R_cDGQ4FpBsSqHXHOBwBrnJNvKiOqSL7zNSmT8Fm4AAAAAAEJAABrnJNvKiOqSL7zNSmT8Fm4AAc6ZkPBAAA=",
  "AAMkADE0ZDI1YjEyLWZhYWItNGEzNi1iNjc2LTRlMjljYTA4MDlkZQBGAAAAAAAnkX2R_cDGQ4FpBsSqHXHOBwBrnJNvKiOqSL7zNSmT8Fm4AAAAAAEJAABrnJNvKiOqSL7zNSmT8Fm4AAc6ZkPBAAABEgAQABcyGCRDaHJFsyR1n11E1Ug="
);
await Bun.write(
  "services/contract/ground-truth/oneaz-surprise/PO_2_SWPPP_1.18.26.pdf",
  oneazPO
);
console.log("Saved OneAZ PO 2");

// OneAZ PO 5 (Temp Fence)
console.log("Downloading OneAZ PO 5...");
const oneazPO5 = await client.downloadAttachment(
  "contracts@desertservices.net",
  "AAMkAGQ4YmVkZjAwLTAwMTAtNDhlMS1hMmQ5LWE1YzI0NDgzODMyYwBGAAAAAACEPmSowjI3T4EFi1tWUfbxBwCh6KD9pgmzRIyy-pE4pZPoAACT4nvnAACh6KD9pgmzRIyy-pE4pZPoAACT4yLpAAA=",
  "AAMkAGQ4YmVkZjAwLTAwMTAtNDhlMS1hMmQ5LWE1YzI0NDgzODMyYwBGAAAAAACEPmSowjI3T4EFi1tWUfbxBwCh6KD9pgmzRIyy-pE4pZPoAACT4nvnAACh6KD9pgmzRIyy-pE4pZPoAACT4yLpAAABEgAQALKW8QERW3hEiCoWDcQM454="
);
await Bun.write(
  "services/contract/ground-truth/oneaz-surprise/PO_5_Temp_Fence_1.26.26.pdf",
  oneazPO5
);
console.log("Saved OneAZ PO 5");

// Edison Park NOI
console.log("Downloading Edison Park NOI...");
const edisonNOI = await client.downloadAttachment(
  "kerin@desertservices.net",
  "AAMkADY0OWRkMGJkLWYwZDYtNGFlMC1hMmRiLWI0NjFhZjM5ZjlkMABGAAAAAABr_Irf3Q1iSqgsHjyPWhNxBwCE-k-HL_AtQb4ukDPHbvmQAAAAAAEMAACE-k-HL_AtQb4ukDPHbvmQAAgBnk7_AAA=",
  "AAMkADY0OWRkMGJkLWYwZDYtNGFlMC1hMmRiLWI0NjFhZjM5ZjlkMABGAAAAAABr_Irf3Q1iSqgsHjyPWhNxBwCE-k-HL_AtQb4ukDPHbvmQAAAAAAEMAACE-k-HL_AtQb4ukDPHbvmQAAgBnk7_AAABEgAQAFhW42sPJchFjGId6LGCHnQ="
);
await Bun.write(
  "services/contract/ground-truth/edison-linear-parks/NOI_Edison_Park.pdf",
  edisonNOI
);
console.log("Saved Edison Park NOI");

// Linear Park NOI
console.log("Downloading Linear Park NOI...");
const linearNOI = await client.downloadAttachment(
  "kerin@desertservices.net",
  "AAMkADY0OWRkMGJkLWYwZDYtNGFlMC1hMmRiLWI0NjFhZjM5ZjlkMABGAAAAAABr_Irf3Q1iSqgsHjyPWhNxBwCE-k-HL_AtQb4ukDPHbvmQAAAAAAEMAACE-k-HL_AtQb4ukDPHbvmQAAgBnk7_AAA=",
  "AAMkADY0OWRkMGJkLWYwZDYtNGFlMC1hMmRiLWI0NjFhZjM5ZjlkMABGAAAAAABr_Irf3Q1iSqgsHjyPWhNxBwCE-k-HL_AtQb4ukDPHbvmQAAAAAAEMAACE-k-HL_AtQb4ukDPHbvmQAAgBnk7_AAABEgAQAHlBQpKFG0BOuGg7Aln13N0="
);
await Bun.write(
  "services/contract/ground-truth/edison-linear-parks/NOI_Linear_Park.pdf",
  linearNOI
);
console.log("Saved Linear Park NOI");

console.log("Done!");
