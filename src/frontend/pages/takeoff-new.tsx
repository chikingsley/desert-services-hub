/**
 * New Takeoff Page
 */
import { PageHeader } from "@/components/page-header";

export function TakeoffNewPage() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        description="Upload a PDF to start a new takeoff"
        title="New Takeoff"
      />
      <div className="flex-1 p-6 lg:p-8">
        <p className="text-muted-foreground">New takeoff UI coming soon.</p>
      </div>
    </div>
  );
}
