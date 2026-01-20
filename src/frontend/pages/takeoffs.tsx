/**
 * Takeoffs List Page
 */
import { Plus } from "lucide-react";
import { Link, useLoaderData } from "react-router";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

interface Takeoff {
  id: string;
  name: string;
  pdf_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

// Loader function for fetching takeoffs
export async function takeoffsLoader() {
  const response = await fetch("/api/takeoffs");
  if (!response.ok) {
    throw new Error("Failed to load takeoffs");
  }
  return response.json();
}

import { NewTakeoffDialog } from "@/components/takeoffs/new-takeoff-dialog";

function TakeoffsHeaderActions() {
  return (
    <NewTakeoffDialog>
      <Button>
        <Plus className="mr-2 h-4 w-4" />
        New Takeoff
      </Button>
    </NewTakeoffDialog>
  );
}

export function TakeoffsPage() {
  const takeoffs = useLoaderData() as Takeoff[];

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        actions={<TakeoffsHeaderActions />}
        breadcrumbs={[{ label: "Takeoffs" }]}
        title="Takeoffs"
      />

      <div className="flex-1 p-6 lg:p-8">
        <div className="page-transition">
          {takeoffs.length === 0 ? (
            <EmptyState
              action={
                <NewTakeoffDialog>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Upload PDF
                  </Button>
                </NewTakeoffDialog>
              }
              description="Upload a site plan PDF to start measuring and counting items."
              title="No takeoffs yet"
            />
          ) : (
            <div className="rounded-xl border border-border bg-card shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {takeoffs.map((takeoff) => (
                    <TableRow key={takeoff.id}>
                      <TableCell>
                        <Link
                          className="font-medium text-primary hover:underline"
                          to={`/takeoffs/${takeoff.id}`}
                        >
                          {takeoff.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{takeoff.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(takeoff.created_at)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(takeoff.updated_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
