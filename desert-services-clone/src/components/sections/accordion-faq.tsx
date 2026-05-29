import { Container } from "@/components/layout/container";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

interface FAQItem {
  question: string;
  answer: string;
}

const PARAGRAPH_SPLIT_REGEX = /\n{2,}/;

export function AccordionFAQ({
  heading,
  items,
  className,
}: {
  heading?: string;
  items: FAQItem[];
  className?: string;
}) {
  return (
    <section className={cn("py-16 md:py-20", className)}>
      <Container className="max-w-3xl">
        {heading && (
          <h2 className="mb-8 text-center font-bold font-heading text-2xl md:text-3xl">
            {heading}
          </h2>
        )}
        <Accordion>
          {items.map((item) => (
            <AccordionItem key={item.question} value={item.question}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>
                {item.answer
                  .split(PARAGRAPH_SPLIT_REGEX)
                  .map((p) => p.trim())
                  .filter(Boolean)
                  .map((p) => (
                    <p key={`${item.question}:${p}`}>{p}</p>
                  ))}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Container>
    </section>
  );
}
