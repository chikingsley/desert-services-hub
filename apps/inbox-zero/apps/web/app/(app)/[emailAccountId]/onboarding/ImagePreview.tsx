import Image from "next/image";

export function OnboardingImagePreview({
  src,
  alt,
  width,
  height,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
}) {
  return (
    <div className="ml-auto max-h-[600px] overflow-hidden rounded-tl-2xl rounded-bl-2xl border-slate-200 border-y border-l bg-slate-50 py-4 pl-4 text-muted-foreground">
      <Image
        alt={alt}
        className="rounded-tl-xl rounded-bl-xl border-slate-200 border-y border-l"
        height={height}
        src={src}
        width={width}
      />
    </div>
  );
}
