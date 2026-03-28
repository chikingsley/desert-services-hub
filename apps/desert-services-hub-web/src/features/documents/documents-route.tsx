import { useLoaderData } from "react-router";

import type { DocumentReviewWorkspace } from "@/features/documents/document-model";
import { DocumentReviewWorkspace as DocumentReviewWorkspaceView } from "@/features/documents/document-review-workspace";
import { documentReviewSampleData } from "@/features/documents/document-sample-data";

interface DocumentsLoaderData {
  workspace: DocumentReviewWorkspace;
}

export const documentsLoader = (): DocumentsLoaderData => ({
  workspace: documentReviewSampleData,
});

export const DocumentsRoute = () => {
  const { workspace } = useLoaderData<DocumentsLoaderData>();

  return <DocumentReviewWorkspaceView items={workspace.items} />;
};
