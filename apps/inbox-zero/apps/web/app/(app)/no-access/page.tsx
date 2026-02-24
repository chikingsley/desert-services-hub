import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NoAccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            No Access
          </CardTitle>
          <CardDescription>
            Email account not found or you don't have access to it
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/accounts">View accounts</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
