"use client";

import type { EarlyAccessFeature } from "posthog-js";
import { useActiveFeatureFlags, usePostHog } from "posthog-js/react";
import { useCallback, useEffect, useState } from "react";
import { Toggle } from "@/components/Toggle";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function EarlyAccessFeatures() {
  const posthog = usePostHog();
  const activeFlags = useActiveFeatureFlags();
  const [features, setFeatures] = useState<EarlyAccessFeature[]>([]);

  useEffect(() => {
    posthog.getEarlyAccessFeatures((features) => {
      setFeatures(features);
    }, true);
  }, [posthog]);

  const toggleBeta = useCallback(
    (betaKey: string) => {
      const isActive = activeFlags?.includes(betaKey);
      posthog.updateEarlyAccessFeatureEnrollment(betaKey, !isActive);
    },
    [posthog, activeFlags]
  );

  if (!features.length) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Early access features</CardTitle>
        <CardDescription>
          You can enable and disable early access features here.
        </CardDescription>
      </CardHeader>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Feature</TableHead>
            <TableHead className="w-24">Enabled</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {features.map((feature) => (
            <TableRow key={feature.name}>
              <TableCell>{feature.name}</TableCell>
              <TableCell>
                <Toggle
                  enabled={!!activeFlags?.includes(feature.flagKey!)}
                  name={feature.name}
                  onChange={() => toggleBeta(feature.flagKey!)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
