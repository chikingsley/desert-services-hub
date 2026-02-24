"use client";

import { LegalPage } from "@/components/LegalPage";
import Content from "./content.mdx";

export function TermsContent() {
  return (
    <LegalPage
      content={<Content />}
      date="2023-07-16"
      title="Terms of Service"
    />
  );
}
