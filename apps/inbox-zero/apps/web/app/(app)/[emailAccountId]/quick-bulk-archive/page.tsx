import { ArchiveProgress } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/ArchiveProgress";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { BulkArchiveTab } from "@/app/(app)/[emailAccountId]/quick-bulk-archive/BulkArchiveTab";
import { ClientOnly } from "@/components/ClientOnly";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";

export default function QuickBulkArchivePage() {
  return (
    <>
      <PermissionsCheck />

      <ClientOnly>
        <ArchiveProgress />
      </ClientOnly>

      <PageWrapper>
        <PageHeader title="Quick Bulk Archive" />

        <ClientOnly>
          <BulkArchiveTab />
        </ClientOnly>
      </PageWrapper>
    </>
  );
}
