import { ArrowRight, FileText, Ruler } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        description="Welcome to Desert Services Hub"
        title="Dashboard"
      />

      <div className="flex-1 p-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Quick Actions */}
          <Card className="md:col-span-2 lg:col-span-3">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Get started with your estimation workflow
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/quotes/new">
                  <FileText className="mr-2 h-4 w-4" />
                  New Quote
                </Link>
              </Button>
              <Button disabled variant="outline">
                <Ruler className="mr-2 h-4 w-4" />
                New Takeoff
                <span className="ml-2 text-muted-foreground text-xs">
                  (Coming Soon)
                </span>
              </Button>
            </CardContent>
          </Card>

          {/* Quotes Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Quotes
              </CardTitle>
              <CardDescription>Create and manage estimates</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Build detailed estimates with line items, sections, and
                automatic pricing calculations.
              </p>
              <Button
                asChild
                className="w-full bg-transparent"
                variant="outline"
              >
                <Link href="/quotes">
                  View Quotes
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Takeoffs Card */}
          <Card className="opacity-60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ruler className="h-5 w-5" />
                Takeoffs
              </CardTitle>
              <CardDescription>Measure and count from PDFs</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Import plan PDFs, set scale, and measure quantities that flow
                directly into quotes.
              </p>
              <Button
                className="w-full bg-transparent"
                disabled
                variant="outline"
              >
                Coming Soon
              </Button>
            </CardContent>
          </Card>

          {/* Workflow Card */}
          <Card>
            <CardHeader>
              <CardTitle>Workflow</CardTitle>
              <CardDescription>Your estimation pipeline</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
                    1
                  </div>
                  <span>Takeoff - Measure from plans</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
                    2
                  </div>
                  <span>Quote - Build the estimate</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs">
                    3
                  </div>
                  <span className="text-muted-foreground">
                    Contract - Reconcile
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs">
                    4
                  </div>
                  <span className="text-muted-foreground">
                    Project - Execute
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
