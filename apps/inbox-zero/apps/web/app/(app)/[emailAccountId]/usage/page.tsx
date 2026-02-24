import { notFound } from "next/navigation";
import { Usage } from "@/app/(app)/[emailAccountId]/usage/usage";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { auth } from "@/utils/auth";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import {
  getCallerEmailAccount,
  getMemberEmailAccount,
} from "@/utils/organizations/access";
import prisma from "@/utils/prisma";
import { getUsage } from "@/utils/redis/usage";

export default async function UsagePage(props: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await props.params;
  const session = await auth();
  const userId = session?.user.id;
  if (!userId) {
    notFound();
  }

  try {
    await checkUserOwnsEmailAccount({ emailAccountId });
  } catch {
    const callerEmailAccount = await getCallerEmailAccount(
      userId,
      emailAccountId
    );

    if (!callerEmailAccount) {
      notFound();
    }

    const memberEmailAccount = await getMemberEmailAccount(
      callerEmailAccount.id,
      emailAccountId
    );

    if (!memberEmailAccount) {
      notFound();
    }
  }

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      email: true,
      name: true,
      user: {
        select: { id: true },
      },
    },
  });

  if (!emailAccount) {
    notFound();
  }

  const usage = await getUsage({ email: emailAccount.email });
  const isOwnAccount = emailAccount.user.id === userId;

  return (
    <PageWrapper>
      <PageHeader
        title={
          isOwnAccount
            ? "Credits and Usage"
            : `Credits and Usage for ${emailAccount.name || emailAccount.email}`
        }
      />
      <div className="my-4">
        <Usage usage={usage} />
      </div>
    </PageWrapper>
  );
}
