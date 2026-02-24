import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/app/(landing)/login/LoginForm";
import { AlertBasic } from "@/components/Alert";
import { CrispChatLoggedOutVisible } from "@/components/CrispChat";
import { MutedText } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { env } from "@/env";
import { auth } from "@/utils/auth";
import { WELCOME_PATH } from "@/utils/config";
import { isInternalPath } from "@/utils/path";

export const metadata: Metadata = {
  title: "Log in | Inbox Zero",
  description: "Log in to Inbox Zero.",
  alternates: { canonical: "/login" },
};

export default async function AuthenticationPage(props: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const searchParams = await props.searchParams;
  const session = await auth();
  if (session?.user && !searchParams?.error) {
    if (searchParams?.next && isInternalPath(searchParams.next)) {
      redirect(searchParams.next);
    } else {
      redirect(WELCOME_PATH);
    }
  }

  return (
    <div className="flex h-screen flex-col justify-center text-foreground">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <div className="flex flex-col text-center">
          <h1 className="font-title text-2xl text-foreground">Sign In</h1>
          <p className="mt-4 text-muted-foreground">
            Your AI personal assistant for email.
          </p>
        </div>
        <div className="mt-4">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>

        {searchParams?.error && <ErrorAlert error={searchParams?.error} />}

        <MutedText className="px-8 pt-10 text-center">
          By clicking continue, you agree to our{" "}
          <Link
            className="underline underline-offset-4 hover:text-foreground"
            href="/terms"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            className="underline underline-offset-4 hover:text-foreground"
            href="/privacy"
          >
            Privacy Policy
          </Link>
          .
        </MutedText>

        <MutedText className="px-4 pt-4 text-center">
          Inbox Zero{"'"}s use and transfer of information received from Google
          APIs to any other app will adhere to{" "}
          <a
            className="underline underline-offset-4 hover:text-foreground"
            href="https://developers.google.com/terms/api-services-user-data-policy"
          >
            Google API Services User Data
          </a>{" "}
          Policy, including the Limited Use requirements.
        </MutedText>
      </div>
    </div>
  );
}

function ErrorAlert({ error }: { error: string }) {
  if (error === "RequiresReconsent") {
    return null;
  }

  if (error === "OAuthAccountNotLinked") {
    return (
      <AlertBasic
        description={
          <>
            <span>You can merge accounts instead.</span>
            <Button asChild className="mt-2">
              <Link href="/accounts">Merge accounts</Link>
            </Button>
          </>
        }
        title="Account already attached to another user"
        variant="destructive"
      />
    );
  }

  if (error === "email_already_linked") {
    return (
      <AlertBasic
        description={`This email address is already linked to another Inbox Zero account. Please sign in with the original account, or use a different email address. If this error persists please contact support at ${env.NEXT_PUBLIC_SUPPORT_EMAIL}`}
        title="Email Already Linked"
        variant="destructive"
      />
    );
  }

  return (
    <>
      <AlertBasic
        description={`There was an error logging in. Please try log in again. If this error persists please contact support at ${env.NEXT_PUBLIC_SUPPORT_EMAIL}`}
        title="Error logging in"
        variant="destructive"
      />
      <Suspense>
        <CrispChatLoggedOutVisible />
      </Suspense>
    </>
  );
}
