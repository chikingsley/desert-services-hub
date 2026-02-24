import { BulkArchive } from "@/app/(app)/[emailAccountId]/bulk-archive/BulkArchive";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";

export default function BulkArchivePage() {
  return (
    <>
      <PermissionsCheck />
      <BulkArchive />
    </>
  );
}
