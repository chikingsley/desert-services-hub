import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function ProfileImage({
  image,
  label = "",
  size = 24,
}: {
  image: string | null;
  label: string;
  size?: number;
}) {
  return (
    <Avatar>
      <AvatarImage height={size} src={image || undefined} width={size} />
      <AvatarFallback>{label.at(0)?.toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}
