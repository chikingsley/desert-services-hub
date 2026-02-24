"use client";

import { LegalPage } from "@/components/LegalPage";
import Content from "./content.mdx";

export function PrivacyContent() {
  return (
    <LegalPage content={<Content />} date="2023-12-20" title="Privacy Policy" />
  );
}
