/**
 * Dashboard Page
 */
import {
  ArrowRight,
  FileCheck,
  FileText,
  Rocket,
  Ruler,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router";
import { PageHeader } from "@/components/page-header";
import { NewQuoteButton } from "@/components/quotes/new-quote-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const workflowSteps = [
  {
    step: 1,
    title: "Takeoff",
    description: "Measure from plans",
    icon: Ruler,
    active: true,
  },
  {
    step: 2,
    title: "Quote",
    description: "Build the estimate",
    icon: FileText,
    active: true,
  },
  {
    step: 3,
    title: "Contract",
    description: "Reconcile & finalize",
    icon: FileCheck,
    active: false,
  },
  {
    step: 4,
    title: "Project",
    description: "Execute & deliver",
    icon: Rocket,
    active: false,
  },
];

export function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        description="Welcome to Desert Services Hub"
        title="Dashboard"
      />

      <div className="flex-1 p-6 lg:p-8">
        {/* Hero Section */}
        <div className="page-transition mb-10">
          <div className="relative overflow-hidden rounded-2xl bg-sidebar p-8 lg:p-10">
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 h-64 w-64 translate-x-1/3 -translate-y-1/3 rounded-full bg-sidebar-primary/20 blur-3xl" />
            <div className="absolute bottom-0 left-1/4 h-48 w-48 translate-y-1/2 rounded-full bg-sidebar-primary/10 blur-2xl" />

            <div className="relative z-10">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-sidebar-primary/20 px-3 py-1 font-medium text-sidebar-primary text-xs">
                <Sparkles className="h-3 w-3" />
                Estimation Platform
              </div>
              <h1 className="mb-3 font-display font-semibold text-3xl text-sidebar-foreground tracking-tight lg:text-4xl">
                Desert Services Hub
              </h1>
              <p className="mb-6 max-w-xl text-base text-sidebar-foreground/70 lg:text-lg">
                Streamline your estimation workflow from measurements to project
                delivery. Built for construction and landscaping professionals.
              </p>
              <div className="flex flex-wrap gap-3">
                <NewQuoteButton
                  className="glow-primary bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
                  size="lg"
                >
                  Create New Quote
                </NewQuoteButton>
                <Button
                  asChild
                  className="border-sidebar-border bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80"
                  size="lg"
                  variant="outline"
                >
                  <Link to="/quotes">
                    View All Quotes
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Workflow Pipeline */}
        <div className="mb-10">
          <h2 className="mb-5 font-display font-semibold text-lg tracking-tight">
            Your Workflow Pipeline
          </h2>
          <div className="stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {workflowSteps.map((item) => (
              <div
                className={`group relative overflow-hidden rounded-xl border p-5 transition-all duration-300 ${
                  item.active
                    ? "hover-lift cursor-pointer border-border bg-card hover:border-primary/30"
                    : "border-border/50 bg-muted/30 opacity-60"
                }`}
                key={item.step}
              >
                {/* Step indicator */}
                <div
                  className={`absolute top-4 right-4 font-bold font-display text-4xl ${
                    item.active
                      ? "text-primary/10 group-hover:text-primary/20"
                      : "text-muted-foreground/10"
                  } transition-colors`}
                >
                  {item.step}
                </div>

                <div
                  className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ${
                    item.active
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                </div>

                <h3
                  className={`font-display font-medium ${
                    item.active ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {item.title}
                </h3>
                <p
                  className={`text-sm ${
                    item.active
                      ? "text-muted-foreground"
                      : "text-muted-foreground/70"
                  }`}
                >
                  {item.description}
                </p>

                {!item.active && (
                  <span className="mt-3 inline-block rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                    Coming soon
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Feature Cards */}
        <div className="stagger-children grid gap-5 lg:grid-cols-2">
          {/* Quotes Feature Card */}
          <Card className="hover-lift group relative overflow-hidden border-border bg-card">
            <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <CardHeader className="relative pb-3">
              <div className="mb-2 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="font-display text-lg">Quotes</CardTitle>
                  <CardDescription>Create and manage estimates</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative">
              <p className="mb-5 text-muted-foreground text-sm leading-relaxed">
                Build detailed estimates with line items, sections, and
                automatic pricing calculations. Version control keeps track of
                all changes.
              </p>
              <div className="flex items-center gap-3">
                <NewQuoteButton className="flex-1">New Quote</NewQuoteButton>
                <Button asChild className="flex-1" variant="outline">
                  <Link to="/quotes">
                    View All
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Takeoffs Feature Card */}
          <Card className="group relative overflow-hidden border-border/50 bg-card/50">
            <div className="absolute inset-0 bg-linear-to-br from-accent/5 via-transparent to-transparent" />
            <CardHeader className="relative pb-3">
              <div className="mb-2 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Ruler className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="font-display text-lg text-muted-foreground">
                    Takeoffs
                  </CardTitle>
                  <CardDescription>Measure and count from PDFs</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative">
              <p className="mb-5 text-muted-foreground/80 text-sm leading-relaxed">
                Import plan PDFs, set scale, and measure quantities that flow
                directly into quotes. Digital takeoffs made simple.
              </p>
              <Button className="w-full" disabled variant="outline">
                <Ruler className="mr-2 h-4 w-4" />
                Coming Soon
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Stats or Quick Info */}
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 text-center">
            <div className="font-display font-semibold text-3xl text-primary">
              4
            </div>
            <div className="text-muted-foreground text-sm">Workflow Stages</div>
          </div>
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 text-center">
            <div className="font-display font-semibold text-3xl text-primary">
              2
            </div>
            <div className="text-muted-foreground text-sm">Modules Active</div>
          </div>
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 text-center">
            <div className="font-display font-semibold text-3xl text-primary">
              v0.1
            </div>
            <div className="text-muted-foreground text-sm">Current Version</div>
          </div>
        </div>
      </div>
    </div>
  );
}
