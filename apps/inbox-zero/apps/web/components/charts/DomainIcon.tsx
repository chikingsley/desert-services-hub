"use client";

import Image from "next/image";
import { useState } from "react";
import { getDomain } from "tldts";
import { cn } from "@/utils";

function getFavicon(apexDomain: string) {
  return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${apexDomain}&size=64`;
}

interface FallbackIconProps {
  seed: string;
  size?: number;
}

export function FallbackIcon({ seed, size = 20 }: FallbackIconProps) {
  const hash = seed.split("").reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0);

  const gradients = [
    "from-blue-300 to-blue-700",
    "from-purple-300 to-purple-700",
    "from-green-300 to-green-700",
    "from-emerald-300 to-emerald-700",
    "from-yellow-300 to-yellow-700",
    "from-orange-300 to-orange-700",
    "from-red-300 to-red-700",
    "from-indigo-300 to-indigo-700",
    "from-pink-300 to-pink-700",
    "from-fuchsia-300 to-fuchsia-700",
    "from-rose-300 to-rose-700",
    "from-sky-300 to-sky-700",
    "from-teal-300 to-teal-700",
    "from-violet-300 to-violet-700",
  ];

  const gradientIndex = hash % gradients.length;

  return (
    <div
      className={cn("z-10 rounded bg-gradient-to-r", gradients[gradientIndex])}
      style={{ width: size, height: size }}
    />
  );
}

interface DomainIconProps {
  domain: string;
  size?: number;
  variant?: "default" | "circular";
}

export function DomainIcon({
  domain,
  size = 20,
  variant = "default",
}: DomainIconProps) {
  const apexDomain = getDomain(domain) || domain;
  const domainFavicon = getFavicon(apexDomain);
  const [fallbackEnabled, setFallbackEnabled] = useState(false);

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden",
        variant === "circular" ? "rounded-full" : "rounded"
      )}
      style={{ width: size, height: size }}
    >
      {fallbackEnabled || !domainFavicon ? (
        <FallbackIcon seed={domain} size={size} />
      ) : (
        <Image
          alt="favicon"
          className="z-10 rounded"
          height={size}
          onError={() => setFallbackEnabled(true)}
          src={domainFavicon}
          width={size}
        />
      )}
    </div>
  );
}
