import { db } from "@lib/db/hub";
import {
  tokenizeProjectText,
  tokenOverlap,
  uniqueStrings,
} from "@lib/db/repositories/project";

interface ProjectContextRow {
  name: string;
  contractor: string | null;
  outlook_folder: string | null;
}

interface ProjectAliasRow {
  alias: string;
}

interface ProjectSubjectGuardContext {
  hintTexts: string[];
  hintTokenSets: Set<string>[];
}

const projectSubjectGuardCache = new Map<
  number,
  ProjectSubjectGuardContext | null
>();

export function buildHintTokenSets(
  hintTexts: Array<string | null | undefined>
): Set<string>[] {
  const out: Set<string>[] = [];
  for (const hint of uniqueStrings(hintTexts)) {
    const tokens = tokenizeProjectText(hint);
    if (tokens.size > 0) {
      out.push(tokens);
    }
  }
  return out;
}

export function subjectMatchesHintTokenSets(
  subject: string,
  hintTokenSets: Set<string>[]
): boolean {
  const subjectTokens = tokenizeProjectText(subject);
  if (subjectTokens.size === 0 || hintTokenSets.length === 0) {
    return false;
  }

  for (const hintTokens of hintTokenSets) {
    const overlap = tokenOverlap(subjectTokens, hintTokens);
    if (overlap.common.length > 0) {
      return true;
    }
  }

  return false;
}

async function loadProjectSubjectGuardContext(
  projectId: number
): Promise<ProjectSubjectGuardContext | null> {
  const project = await db
    .query<ProjectContextRow, [number]>(
      "SELECT name, contractor, outlook_folder FROM projects WHERE id = ?"
    )
    .get(projectId);
  if (!project) {
    return null;
  }

  const aliases = await db
    .query<ProjectAliasRow, [number]>(
      "SELECT alias FROM project_aliases WHERE project_id = ?"
    )
    .all(projectId);

  const hintTexts = uniqueStrings([
    project.name,
    project.contractor,
    project.outlook_folder,
    ...aliases.map((row) => row.alias),
  ]);

  return {
    hintTexts,
    hintTokenSets: buildHintTokenSets(hintTexts),
  };
}

export async function getProjectSubjectGuardContext(
  projectId: number
): Promise<ProjectSubjectGuardContext | null> {
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return null;
  }

  const cached = projectSubjectGuardCache.get(projectId);
  if (cached !== undefined) {
    return cached;
  }

  const loaded = await loadProjectSubjectGuardContext(projectId);
  projectSubjectGuardCache.set(projectId, loaded);
  return loaded;
}

export function clearProjectSubjectGuardCache(): void {
  projectSubjectGuardCache.clear();
}

export async function isSubjectCompatibleWithProject(opts: {
  projectId: number;
  subject: string;
  additionalHints?: string[];
}): Promise<boolean> {
  const context = await getProjectSubjectGuardContext(opts.projectId);
  if (!context) {
    return false;
  }

  const allTokenSets = [...context.hintTokenSets];
  if (opts.additionalHints && opts.additionalHints.length > 0) {
    allTokenSets.push(...buildHintTokenSets(opts.additionalHints));
  }

  return subjectMatchesHintTokenSets(opts.subject, allTokenSets);
}
