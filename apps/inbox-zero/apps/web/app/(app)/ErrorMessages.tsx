import { AlertError } from "@/components/Alert";
import { Button } from "@/components/ui/button";
import { clearUserErrorMessagesAction } from "@/utils/actions/error-messages";
import { auth } from "@/utils/auth";
import { getUserErrorMessages } from "@/utils/error-messages";

export async function ErrorMessages() {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  const errorMessages = await getUserErrorMessages(session.user.id);

  if (!errorMessages || Object.keys(errorMessages).length === 0) {
    return null;
  }

  return (
    <div className="mx-auto mt-6 mb-2 w-full max-w-screen-xl space-y-2 px-4">
      <AlertError
        description={
          <div className="mt-2 flex flex-col gap-3">
            <ul className="list-disc space-y-1 pl-5">
              {Object.values(errorMessages).map((error) => (
                <li key={error.message}>{error.message}</li>
              ))}
            </ul>

            <form action={clearUserErrorMessagesAction as () => void}>
              <Button size="sm" type="submit" variant="red">
                I've fixed them
              </Button>
            </form>
          </div>
        }
        title="Action Required"
      />
    </div>
  );
}
