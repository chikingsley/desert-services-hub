import { Button } from "@/components/Button";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { PageHeading, TypographyP } from "@/components/Typography";
import { CardBasic } from "@/components/ui/card";

// same component as not-found
export default function ThankYouPage() {
  return (
    <BasicLayout>
      <div className="pt-60 pb-40">
        <CardBasic className="mx-auto max-w-xl text-center">
          <PageHeading>Thank you!</PageHeading>
          <div className="mt-2">
            <TypographyP>
              Your premium purchase was successful. Thank you for supporting us!
            </TypographyP>
          </div>
          <Button className="mt-4" link={{ href: "/setup" }} size="xl">
            Continue
          </Button>
        </CardBasic>
      </div>
    </BasicLayout>
  );
}
