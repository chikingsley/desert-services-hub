import Image from "next/image";

export function PersonWithLogo({
  src,
  name,
  title,
}: {
  src: string;
  name: string;
  title: string;
}) {
  return (
    <div className="flex items-center justify-center space-x-4">
      <div className="flex-shrink-0">
        <Image
          alt={name}
          className="h-12 w-12 rounded-full object-cover ring-2 ring-blue-200"
          height={48}
          src={src}
          width={48}
        />
      </div>
      <div className="text-left">
        <p className="font-medium text-base text-gray-900">{name}</p>
        <p className="text-gray-600 text-sm">{title}</p>
      </div>
    </div>
  );
}

export function ABTestimonial() {
  return (
    <PersonWithLogo
      name='Abraham "AB" Lieberman'
      src="/images/case-studies/clicks-talent/ab.png"
      title="Founder & CEO of Clicks Talent"
    />
  );
}
