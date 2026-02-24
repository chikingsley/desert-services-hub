"use client";

import { useState } from "react";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { TabSelect } from "@/components/TabSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/utils";

interface BarListCardProps {
  icon: React.ReactNode;
  tabs: {
    id: string;
    label: string;
    data: { name: string; value: number; href?: string; target?: string }[];
  }[];
  title: string;
}

export function BarListCard({ tabs, icon, title }: BarListCardProps) {
  const [selected, setSelected] = useState<string | null>(
    tabs?.length > 0 ? tabs[0]?.id : null
  );

  const selectedTabData = tabs.find((d) => d.id === selected)?.data || [];

  return (
    <Card className="relative h-full w-full max-w-full overflow-x-hidden bg-background">
      <CardHeader className="overflow-x-hidden p-0">
        <div className="flex min-w-0 items-center justify-between gap-2 border-neutral-200 border-b px-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <TabSelect
              onSelect={(id: string) => setSelected(id)}
              options={tabs.map((d) => ({ id: d.id, label: d.label }))}
              selected={selected}
            />
          </div>
          <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">
            {icon}
            <p className="whitespace-nowrap text-neutral-500 text-xs">
              {title.toUpperCase()}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-[330px] w-full max-w-full overflow-hidden overflow-x-hidden px-3 pt-5 pb-0 sm:px-5">
        <div
          className={cn(
            "pointer-events-none absolute bottom-0 left-0 z-20 h-1/2 w-full rounded-[0.44rem]",
            "bg-gradient-to-b from-transparent to-white dark:to-black"
          )}
        />
        {selectedTabData.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            <div className="space-y-2 px-4 text-center">
              <div className="text-muted-foreground text-sm">
                No data available
              </div>
              <p className="text-muted-foreground/70 text-xs">
                Select a different time period to view statistics
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="w-full min-w-0 max-w-full overflow-x-hidden">
              <HorizontalBarChart data={selectedTabData} />
            </div>
            <div className="absolute bottom-0 left-0 z-30 w-full px-3 pb-6 sm:px-5">
              <div className="flex max-w-full justify-center">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="xs-2" variant="outline">
                      View more
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl gap-0 p-0">
                    <DialogHeader className="border-neutral-200 border-b px-6 py-4">
                      <div className="flex items-center gap-2">
                        {icon}
                        <DialogTitle className="font-medium text-base text-neutral-900">
                          {title}
                        </DialogTitle>
                      </div>
                    </DialogHeader>
                    <div className="max-h-[60vh] overflow-y-auto p-6">
                      <HorizontalBarChart data={selectedTabData} />
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
