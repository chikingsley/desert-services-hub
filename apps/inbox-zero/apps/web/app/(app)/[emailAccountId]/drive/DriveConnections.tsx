"use client";

import { LoadingContent } from "@/components/LoadingContent";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import { DriveConnectionCard } from "./DriveConnectionCard";

export function DriveConnections() {
  const { data, isLoading, error } = useDriveConnections();
  const connections = data?.connections || [];

  return (
    <LoadingContent error={error} loading={isLoading}>
      {connections.length > 0 ? (
        <div>
          {connections.map((connection) => (
            <DriveConnectionCard connection={connection} key={connection.id} />
          ))}
        </div>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No drive connections found</EmptyTitle>
            <EmptyDescription>
              Connect your drive to start organizing your documents.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </LoadingContent>
  );
}
