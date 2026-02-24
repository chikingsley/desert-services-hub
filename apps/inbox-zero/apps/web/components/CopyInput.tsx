"use client";

import { CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyInput({
  value,
  masked,
}: {
  value: string;
  masked?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(!masked);

  return (
    <div className="flex w-full flex-1 items-center gap-1">
      <input
        className="block w-full flex-1 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 disabled:ring-gray-200 sm:text-sm"
        disabled
        name="copy-input"
        readOnly
        type={visible ? "text" : "password"}
        value={value}
      />
      {masked && (
        <Button
          onClick={() => setVisible((v) => !v)}
          type="button"
          variant="outline"
        >
          {visible ? (
            <EyeOffIcon className="size-4" />
          ) : (
            <EyeIcon className="size-4" />
          )}
        </Button>
      )}
      <Button
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
        }}
        variant="outline"
      >
        <CopyIcon className="mr-2 size-4" />
        {copied ? "Copied!" : "Copy"}
      </Button>
    </div>
  );
}
