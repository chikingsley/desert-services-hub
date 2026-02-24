"use client";

import { IntegrationRow } from "@/app/(app)/[emailAccountId]/integrations/IntegrationRow";
import { LoadingContent } from "@/components/LoadingContent";
import { TypographyP } from "@/components/Typography";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIntegrations } from "@/hooks/useIntegrations";

export function Integrations() {
  const { data, isLoading, error, mutate } = useIntegrations();

  const integrations = data?.integrations || [];

  return (
    <Card>
      <LoadingContent error={error} loading={isLoading}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Connection</TableHead>
              <TableHead className="hidden sm:table-cell">Tools</TableHead>
              <TableHead>Enable</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {integrations.length ? (
              integrations.map((integration) => (
                <IntegrationRow
                  integration={integration}
                  key={integration.name}
                  onConnectionChange={mutate}
                />
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5}>
                  <TypographyP>No integrations found</TypographyP>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </LoadingContent>
    </Card>
  );
}
