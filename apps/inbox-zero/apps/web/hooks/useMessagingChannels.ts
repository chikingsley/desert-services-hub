import useSWR from "swr";
import type { GetChannelTargetsResponse } from "@/app/api/user/messaging-channels/[channelId]/targets/route";
import type { GetMessagingChannelsResponse } from "@/app/api/user/messaging-channels/route";

export function useMessagingChannels() {
  return useSWR<GetMessagingChannelsResponse>("/api/user/messaging-channels");
}

export function useChannelTargets(channelId: string | null) {
  return useSWR<GetChannelTargetsResponse>(
    channelId ? `/api/user/messaging-channels/${channelId}/targets` : null
  );
}
