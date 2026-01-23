/**
 * Seed Projects - Manual project creation based on email review
 */
import {
  createProject,
  db,
  getAccountByDomain,
  getAllProjects,
  getEmailsForAccount,
  linkEmailToProject,
} from "./db";

interface ProjectDef {
  name: string;
  patterns: string[]; // Subject patterns to match
  address?: string;
}

interface AccountProjects {
  domain: string;
  projects: ProjectDef[];
}

// Projects identified from email review
const ACCOUNT_PROJECTS: AccountProjects[] = [
  {
    domain: "fclbuilders.com",
    projects: [
      {
        name: "Bethany Bay",
        patterns: ["Bethany Bay", "25404"],
      },
      {
        name: "DSV Logistics Phase 1",
        patterns: ["DSV Logistics", "25407", "9560 E. Pecos"],
        address: "9560 E. Pecos Rd, Mesa, AZ",
      },
      {
        name: "Brickyards",
        patterns: ["Brickyards", "23407"],
      },
    ],
  },
  {
    domain: "holder.com",
    projects: [
      {
        name: "Aligned PHX06-2",
        patterns: ["Aligned PHX06-2", "Aligned PHX06"],
      },
    ],
  },
  {
    domain: "arco1.com",
    projects: [
      {
        name: "KTEC Phoenix",
        patterns: ["KTEC Phoenix", "525 KTEC", "KTEC PHX"],
      },
      {
        name: "Sidney Village",
        patterns: ["Sidney Village"],
      },
    ],
  },
  {
    domain: "bprcompanies.com",
    projects: [
      {
        name: "PV Lot C3",
        patterns: ["PV Lot C3", "PV Redevelopment"],
      },
    ],
  },
  {
    domain: "weisbuilders.com",
    projects: [
      {
        name: "Allasso Ranch",
        patterns: ["Allasso"],
      },
      {
        name: "67 Flats",
        patterns: ["67 Flats"],
      },
    ],
  },
  {
    domain: "sundt.com",
    projects: [
      {
        name: "SHSL Litchfield Road",
        patterns: ["SHSL", "Litchfield Road"],
      },
    ],
  },
  {
    domain: "nrpgroup.com",
    projects: [
      {
        name: "Desert Sky",
        patterns: ["Desert Sky"],
      },
    ],
  },
  {
    domain: "lgedesignbuild.com",
    projects: [
      {
        name: "International Furniture Direct",
        patterns: ["International Furniture"],
      },
      {
        name: "Muscular Moving Men",
        patterns: ["Muscular Moving"],
      },
    ],
  },
  {
    domain: "armays.com",
    projects: [
      {
        name: "Rita Ranch Sprouts",
        patterns: ["Rita Ranch", "Sprouts"],
      },
      {
        name: "Pecos & McQueen Storage",
        patterns: ["Pecos & McQueen", "Pecos McQueen"],
      },
      {
        name: "Jefferson House",
        patterns: ["Jefferson House"],
      },
      {
        name: "Parkview",
        patterns: ["Parkview"],
      },
    ],
  },
  {
    domain: "tlwconstruction.com",
    projects: [
      {
        name: "U-Haul Palm Valley",
        patterns: ["U-Haul Palm Valley", "25-162"],
      },
      {
        name: "High Bridge Partners Storage",
        patterns: ["High Bridge", "25-164"],
      },
    ],
  },
  {
    domain: "laytonconstruction.com",
    projects: [
      {
        name: "Cavasson MOB + Retail",
        patterns: ["Cavasson"],
      },
    ],
  },
  {
    domain: "ganemcompanies.com",
    projects: [
      {
        name: "Pacific Tek",
        patterns: ["Pacific Tek"],
      },
    ],
  },
  {
    domain: "sdb.com",
    projects: [
      {
        name: "MC NW Durango Storm Drain",
        patterns: ["Durango", "22-0060"],
      },
    ],
  },
  {
    domain: "nfccontractinggroup.com",
    projects: [
      {
        name: "Good Day Car Wash",
        patterns: ["Good Day Car Wash"],
      },
    ],
  },
  {
    domain: "mycon.com",
    projects: [
      {
        name: "Tucson Rehabilitation Hospital",
        patterns: ["Tucson Rehabilitation"],
      },
    ],
  },
  {
    domain: "eosbuilders.com",
    projects: [
      {
        name: "Helen Drake Village",
        patterns: ["Helen Drake"],
      },
      {
        name: "Moreland Phase 1",
        patterns: ["Moreland"],
      },
    ],
  },
  {
    domain: "embrey.com",
    projects: [
      {
        name: "Greenway Parkway",
        patterns: ["Greenway Parkway"],
      },
    ],
  },
  {
    domain: "calienteconstruction.com",
    projects: [
      {
        name: "Kiwanis North Playground",
        patterns: ["Kiwanis"],
      },
    ],
  },
  {
    domain: "johanseninteriors.com",
    projects: [
      {
        name: "Spinato's Pizza",
        patterns: ["Spinato"],
      },
      {
        name: "PX 5058 Surprise",
        patterns: ["PX 5058"],
      },
    ],
  },
];

function emailMatchesProject(
  subject: string | null,
  patterns: string[]
): boolean {
  if (!subject) {
    return false;
  }
  const lower = subject.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

export function seedProjects(): void {
  console.log("Seeding projects from manual review...\n");

  let projectsCreated = 0;
  let emailsLinked = 0;

  for (const ap of ACCOUNT_PROJECTS) {
    const account = getAccountByDomain(ap.domain);
    if (!account) {
      console.log(`[SKIP] Account not found: ${ap.domain}`);
      continue;
    }

    console.log(`\n=== ${account.name} ===`);

    const emails = getEmailsForAccount(account.id);

    for (const projDef of ap.projects) {
      // Create project
      const project = createProject(projDef.name, account.id, projDef.address);
      projectsCreated++;
      console.log(`  Created: ${projDef.name}`);

      // Link matching emails
      let linked = 0;
      for (const email of emails) {
        if (emailMatchesProject(email.subject, projDef.patterns)) {
          linkEmailToProject(email.id, project.id);
          linked++;
        }
      }
      emailsLinked += linked;
      console.log(`    → ${linked} emails linked`);
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Projects created: ${projectsCreated}`);
  console.log(`Emails linked: ${emailsLinked}`);
}

export function showProjects(): void {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║          PROJECT SUMMARY             ║");
  console.log("╚══════════════════════════════════════╝\n");

  const projects = getAllProjects();

  for (const p of projects) {
    const account = p.accountId
      ? db
          .query<{ name: string }, [number]>(
            "SELECT name FROM accounts WHERE id = ?"
          )
          .get(p.accountId)
      : null;

    console.log(`${p.name} (${account?.name ?? "no account"})`);
    console.log(`  Emails: ${p.emailCount}`);
    if (p.firstSeen && p.lastSeen) {
      console.log(
        `  Active: ${p.firstSeen.split("T")[0]} → ${p.lastSeen.split("T")[0]}`
      );
    }
    console.log("");
  }
}

// CLI
if (import.meta.main) {
  const cmd = process.argv[2] || "seed";

  switch (cmd) {
    case "seed":
      seedProjects();
      showProjects();
      break;
    case "show":
      showProjects();
      break;
    default:
      console.log(`
Usage: bun services/email/census/seed-projects.ts [command]

Commands:
  seed    Create projects and link emails (default)
  show    Show project summary
`);
  }
}
