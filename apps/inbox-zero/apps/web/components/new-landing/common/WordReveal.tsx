import { BlurFade } from "@/components/new-landing/common/BlurFade";
import { cn } from "@/utils";

interface WordRevealProps {
  children?: string;
  delay?: number;
  duration?: number;
  spaceBetween?: string;
  words?: React.ReactNode[];
}

export function WordReveal({
  children,
  words,
  duration = 0.06,
  delay = 0,
  spaceBetween = "w-3",
}: WordRevealProps) {
  const wordsToReveal = children ? children.split(" ") : words || [];

  return (
    <>
      {wordsToReveal.map((word, index) => (
        <BlurFade
          as="span"
          delay={delay + duration * index}
          inView
          key={`${word}-${index}`}
        >
          {word}
          {index < wordsToReveal.length - 1 && (
            <span className={cn("inline-block", spaceBetween)}> </span>
          )}
        </BlurFade>
      ))}
    </>
  );
}
