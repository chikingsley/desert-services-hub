export interface HydrateProjectStats {
  projectId: number;
  projectName: string;
  destinationFolderName: string;
  destinationFolderId: string;
  threadsConsidered: number;
  threadsSkippedMixed: number;
  messagesAlreadyInFolder: number;
  messagesToMove: number;
  orphanCount: number;
  moved: number;
  moveErrors: number;
  dbUpdated: number;
  dbSkipped: number;
  dbErrors: number;
}

export interface HydrateTrackedOptions {
  userId: string;
  apply: boolean;
  limit: number;
  maxThreads: number;
  includeMixed: boolean;
  maxProjects: number;
  concurrency: number;
  skipDbUpdate: boolean;
}

export interface HydrateProjectOptions {
  projectArg: string;
  userId: string;
  apply: boolean;
  limit: number;
  maxThreads: number;
  includeMixed: boolean;
  showPaths: boolean;
  maxDepth: number;
  quiet: boolean;
  concurrency: number;
  skipDbUpdate: boolean;
}
