import { redirect } from "next/navigation";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import { prefixPath } from "@/utils/path";

export default async function SetupPage(props: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await props.params;
  await checkUserOwnsEmailAccount({ emailAccountId });

  redirect(prefixPath(emailAccountId, "/automation"));
}
