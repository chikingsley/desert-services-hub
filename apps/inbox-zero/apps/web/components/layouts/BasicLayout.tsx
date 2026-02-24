import { Footer } from "@/components/new-landing/sections/Footer";
import { Header } from "@/components/new-landing/sections/Header";
import { cn } from "@/utils";

const LAYOUT_CLASSNAME = "max-w-6xl mx-auto px-6 lg:px-8 xl:px-0";

export function BasicLayout(props: { children: React.ReactNode }) {
  return (
    <div>
      <Header className={LAYOUT_CLASSNAME} />
      <main className={cn("isolate", LAYOUT_CLASSNAME)}>{props.children}</main>
      <Footer className={LAYOUT_CLASSNAME} />
    </div>
  );
}
