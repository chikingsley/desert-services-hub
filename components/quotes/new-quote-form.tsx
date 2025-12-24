"use client";

import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import {
  clearTakeoffQuoteData,
  getTakeoffQuoteData,
  type TakeoffQuoteData,
} from "@/lib/takeoff-quote-store";
import { groupBySection } from "@/lib/takeoff-to-quote";
import { generateBaseNumber } from "@/lib/utils";

export function NewQuoteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isFromTakeoff = searchParams.get("from") === "takeoff";
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [takeoffData, setTakeoffData] = useState<TakeoffQuoteData | null>(null);

  const [formData, setFormData] = useState({
    job_name: "",
    job_address: "",
    client_name: "",
    client_email: "",
    client_phone: "",
    notes: "",
  });

  // Load takeoff data if coming from takeoff page
  useEffect(() => {
    if (isFromTakeoff) {
      const data = getTakeoffQuoteData();
      if (data) {
        setTakeoffData(data);
        setFormData((prev) => ({
          ...prev,
          job_name: data.takeoffName,
          notes: `Created from takeoff: ${data.takeoffName}`,
        }));
      }
    }
  }, [isFromTakeoff]);

  const getUniqueBaseNumber = async (
    supabase: ReturnType<typeof createClient>
  ) => {
    let baseNumber = generateBaseNumber();
    let suffix = 1;

    // Check if base number exists and increment if needed
    const { data: existingQuotes } = await supabase
      .from("quotes")
      .select("base_number")
      .like("base_number", `${baseNumber}%`)
      .order("base_number", { ascending: false })
      .limit(1);

    if (existingQuotes && existingQuotes.length > 0) {
      const lastNumber = existingQuotes[0].base_number;
      if (lastNumber.length > 6) {
        suffix = Number.parseInt(lastNumber.slice(6), 10) + 1;
      }
      baseNumber = `${baseNumber}${suffix.toString().padStart(2, "0")}`;
    }
    return baseNumber;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const supabase = createClient();

    try {
      const baseNumber = await getUniqueBaseNumber(supabase);

      // Create the quote
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .insert({
          base_number: baseNumber,
          job_name: formData.job_name,
          job_address: formData.job_address || null,
          client_name: formData.client_name || null,
          client_email: formData.client_email || null,
          client_phone: formData.client_phone || null,
          notes: formData.notes || null,
          status: "draft",
          is_locked: false,
        })
        .select()
        .single();

      if (quoteError) {
        throw quoteError;
      }

      // Create the first version
      const { data: version, error: versionError } = await supabase
        .from("quote_versions")
        .insert({
          quote_id: quote.id,
          version_number: 1,
          total: 0,
          is_current: true,
        })
        .select()
        .single();

      if (versionError) {
        throw versionError;
      }

      // If we have takeoff data, create sections and line items
      if (takeoffData && takeoffData.summaryItems.length > 0) {
        const sectionGroups = groupBySection(takeoffData.summaryItems);
        const sectionIdMap = new Map<string, string>();
        let sortOrder = 0;

        // Create sections
        for (const [sectionName, _items] of sectionGroups) {
          const { data: section, error: sectionError } = await supabase
            .from("quote_sections")
            .insert({
              version_id: version.id,
              name: sectionName,
              sort_order: sortOrder++,
            })
            .select()
            .single();

          if (sectionError) {
            console.error("Error creating section:", sectionError);
            continue;
          }

          sectionIdMap.set(sectionName, section.id);
        }

        // Create line items
        let lineItemOrder = 0;
        let total = 0;

        for (const item of takeoffData.summaryItems) {
          const sectionId = sectionIdMap.get(item.sectionName) || null;
          const quantity = Math.round(item.quantity * 100) / 100;
          const lineTotal = quantity * item.unitPrice;
          total += lineTotal;

          const { error: lineItemError } = await supabase
            .from("quote_line_items")
            .insert({
              version_id: version.id,
              section_id: sectionId,
              description: item.name,
              quantity,
              unit: item.unit,
              unit_cost: item.unitCost,
              unit_price: item.unitPrice,
              is_excluded: false,
              notes: item.description,
              sort_order: lineItemOrder++,
            });

          if (lineItemError) {
            console.error("Error creating line item:", lineItemError);
          }
        }

        // Update version total
        await supabase
          .from("quote_versions")
          .update({ total })
          .eq("id", version.id);

        // Clear takeoff data from session storage
        clearTakeoffQuoteData();
      }

      // Redirect to the quote editor
      router.push(`/quotes/${quote.id}`);
    } catch (err) {
      console.error("Error creating quote:", err);
      setError(err instanceof Error ? err.message : "Failed to create quote");
      setIsLoading(false);
    }
  };

  return (
    <form className="mx-auto max-w-2xl space-y-6" onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Job Information</CardTitle>
          <CardDescription>
            Enter the basic details for this quote
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="job_name">
              Job Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="job_name"
              onChange={(e) =>
                setFormData({ ...formData, job_name: e.target.value })
              }
              placeholder="e.g., Smith Residence - Site Grading"
              required
              value={formData.job_name}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="job_address">Job Address</Label>
            <Input
              id="job_address"
              onChange={(e) =>
                setFormData({ ...formData, job_address: e.target.value })
              }
              placeholder="e.g., 123 Main St, Phoenix, AZ 85001"
              value={formData.job_address}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client Information</CardTitle>
          <CardDescription>Who is this quote for?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client_name">Client / Company Name</Label>
            <Input
              id="client_name"
              onChange={(e) =>
                setFormData({ ...formData, client_name: e.target.value })
              }
              placeholder="e.g., ABC Construction"
              value={formData.client_name}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="client_email">Email</Label>
              <Input
                id="client_email"
                onChange={(e) =>
                  setFormData({ ...formData, client_email: e.target.value })
                }
                placeholder="client@example.com"
                type="email"
                value={formData.client_email}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client_phone">Phone</Label>
              <Input
                id="client_phone"
                onChange={(e) =>
                  setFormData({ ...formData, client_phone: e.target.value })
                }
                placeholder="(555) 123-4567"
                type="tel"
                value={formData.client_phone}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {takeoffData && takeoffData.summaryItems.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
                {takeoffData.summaryItems.length}
              </span>
              Items from Takeoff
            </CardTitle>
            <CardDescription>
              These line items will be automatically added to your quote
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {takeoffData.summaryItems.map((item) => (
                <div
                  className="flex items-center justify-between rounded-md bg-background p-2 text-sm"
                  key={item.itemId}
                >
                  <div className="flex-1">
                    <span className="font-medium">{item.name}</span>
                    <span className="text-muted-foreground">
                      {" — "}
                      {item.quantity.toFixed(2)} {item.unit}
                    </span>
                  </div>
                  <div className="font-medium text-primary">
                    ${(item.quantity * item.unitPrice).toFixed(2)}
                  </div>
                </div>
              ))}
              <div className="mt-4 flex items-center justify-between border-t pt-4 font-semibold">
                <span>Estimated Total</span>
                <span className="text-lg text-primary">
                  $
                  {takeoffData.summaryItems
                    .reduce(
                      (sum, item) => sum + item.quantity * item.unitPrice,
                      0
                    )
                    .toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
          <CardDescription>
            Internal notes about this quote (not shown on PDF)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            id="notes"
            onChange={(e) =>
              setFormData({ ...formData, notes: e.target.value })
            }
            placeholder="Any additional notes..."
            rows={3}
            value={formData.notes}
          />
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button
          disabled={isLoading}
          onClick={() => router.back()}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button disabled={isLoading || !formData.job_name} type="submit">
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Quote"
          )}
        </Button>
      </div>
    </form>
  );
}
