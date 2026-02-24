"use client";

import Image from "next/image";
import { BlurFade } from "@/components/new-landing/common/BlurFade";
import { Paragraph } from "@/components/new-landing/common/Typography";
import { cn } from "@/utils";
import { BRANDS_LIST, type Brand } from "@/utils/brands";
import { userCount } from "@/utils/config";

interface BrandScrollerProps {
  animate?: boolean;
  brandList?: Brand[];
}

export const BrandScroller = ({
  brandList = BRANDS_LIST.default,
  animate = true,
}: BrandScrollerProps) => {
  return (
    <BlurFade delay={0.125 * 10} duration={0.4}>
      <div className="mt-12">
        <Paragraph>Join {userCount} users saving hours daily</Paragraph>
        <div className="group flex max-w-full flex-row overflow-x-hidden py-10 [--gap:2rem] [gap:var(--gap))] [mask-image:linear-gradient(to_right,_rgba(0,_0,_0,_0),rgba(0,_0,_0,_1)_10%,rgba(0,_0,_0,_1)_90%,rgba(0,_0,_0,_0))] md:[--gap:3rem]">
          {new Array(4).fill(0).map((_, i) => (
            <div
              className={cn(
                "flex shrink-0 flex-row justify-around opacity-90 [--duration:100s] [gap:var(--gap)] [margin-right:var(--gap)]",
                animate ? "animate-marquee" : ""
              )}
              key={i}
            >
              {brandList.map(({ alt, src, height }) => (
                <div className="flex items-start" key={alt}>
                  <Image
                    alt={alt}
                    className={cn("w-auto", height || "h-5 sm:h-6 md:h-8")}
                    height={100}
                    src={src}
                    width={100}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </BlurFade>
  );
};
