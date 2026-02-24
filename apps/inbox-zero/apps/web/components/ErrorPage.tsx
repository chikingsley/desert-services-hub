import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ErrorPage(props: {
  title: string;
  description: string;
  button?: React.ReactNode;
}) {
  return (
    <div className="pt-60 pb-40">
      <Card className="mx-auto max-w-lg text-center">
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
          <CardDescription>{props.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {props.button || (
            <Button asChild>
              <Link href="/">Return Home</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
