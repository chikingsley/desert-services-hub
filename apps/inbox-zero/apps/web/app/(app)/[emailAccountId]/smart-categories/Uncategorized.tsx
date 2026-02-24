"use client";

import { ChevronsDownIcon, SparklesIcon, StopCircleIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import useSWRInfinite from "swr/infinite";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import type { UncategorizedSendersResponse } from "@/app/api/user/categorize/senders/uncategorized/route";
import { ClientOnly } from "@/components/ClientOnly";
import { SendersTable } from "@/components/GroupedTable";
import { ButtonLoader } from "@/components/Loading";
import { LoadingContent } from "@/components/LoadingContent";
import { PremiumTooltip, usePremium } from "@/components/PremiumAlert";
import { toastError } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { TopBar } from "@/components/TopBar";
import { SectionDescription } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  pushToAiCategorizeSenderQueueAtom,
  stopAiCategorizeSenderQueue,
  useHasProcessingItems,
} from "@/store/ai-categorize-sender-queue";
import { setAutoCategorizeAction } from "@/utils/actions/categorize";
import type { CategoryWithRules } from "@/utils/category.server";

export function Uncategorized({
  categories,
  autoCategorizeSenders,
}: {
  categories: CategoryWithRules[];
  autoCategorizeSenders: boolean;
}) {
  const { hasAiAccess } = usePremium();
  const { PremiumModal, openModal: openPremiumModal } = usePremiumModal();

  const { data: senderAddresses, loadMore, isLoading, hasMore } = useSenders();
  const hasProcessingItems = useHasProcessingItems();

  const senders = useMemo(
    () =>
      senderAddresses?.map((sender) => {
        return { address: sender.email, name: sender.name, category: null };
      }),
    [senderAddresses]
  );

  const { emailAccountId } = useAccount();

  return (
    <LoadingContent loading={!senderAddresses && isLoading}>
      <TopBar>
        <div className="flex gap-2">
          <PremiumTooltip
            openModal={openPremiumModal}
            showTooltip={!hasAiAccess}
          >
            <Button
              disabled={!hasAiAccess}
              loading={hasProcessingItems}
              onClick={async () => {
                if (!senderAddresses?.length) {
                  toastError({ description: "No senders to categorize" });
                  return;
                }

                pushToAiCategorizeSenderQueueAtom({
                  pushIds: senderAddresses.map((s) => s.email),
                  emailAccountId,
                });
              }}
            >
              <SparklesIcon className="mr-2 size-4" />
              Categorize all with AI
            </Button>
          </PremiumTooltip>

          {hasProcessingItems && (
            <Button
              onClick={() => {
                stopAiCategorizeSenderQueue();
              }}
              variant="outline"
            >
              <StopCircleIcon className="mr-2 size-4" />
              Stop
            </Button>
          )}
        </div>

        <div className="flex items-center">
          <div className="mr-1.5">
            <TooltipExplanation
              size="sm"
              text="Automatically categorize new senders when they email you"
            />
          </div>
          <AutoCategorizeToggle
            autoCategorizeSenders={autoCategorizeSenders}
            emailAccountId={emailAccountId}
          />
        </div>
      </TopBar>
      <ClientOnly>
        {senders?.length ? (
          <>
            <SendersTable categories={categories} senders={senders} />
            {hasMore && (
              <Button
                className="mx-2 mt-2 mb-4 w-full"
                onClick={loadMore}
                variant="outline"
              >
                {isLoading ? (
                  <ButtonLoader />
                ) : (
                  <ChevronsDownIcon className="mr-2 size-4" />
                )}
                Load More
              </Button>
            )}
          </>
        ) : (
          !isLoading && (
            <SectionDescription className="p-4">
              No senders left to categorize!
            </SectionDescription>
          )
        )}
      </ClientOnly>
      <PremiumModal />
    </LoadingContent>
  );
}

function AutoCategorizeToggle({
  autoCategorizeSenders,
  emailAccountId,
}: {
  autoCategorizeSenders: boolean;
  emailAccountId: string;
}) {
  return (
    <Toggle
      enabled={autoCategorizeSenders}
      label="Auto categorize"
      name="autoCategorizeSenders"
      onChange={async (enabled) => {
        await setAutoCategorizeAction(emailAccountId, {
          autoCategorizeSenders: enabled,
        });
      }}
    />
  );
}

function useSenders() {
  const getKey = (
    pageIndex: number,
    previousPageData: UncategorizedSendersResponse | null
  ) => {
    // Reached the end
    if (previousPageData && !previousPageData.nextOffset) {
      return null;
    }

    const baseUrl = "/api/user/categorize/senders/uncategorized";
    const offset = pageIndex === 0 ? 0 : previousPageData?.nextOffset;

    return `${baseUrl}?offset=${offset}`;
  };

  const { data, size, setSize, isLoading } =
    useSWRInfinite<UncategorizedSendersResponse>(getKey, {
      revalidateOnFocus: false,
      revalidateFirstPage: false,
      persistSize: true,
      revalidateOnMount: true,
    });

  const loadMore = useCallback(() => {
    setSize(size + 1);
  }, [setSize, size]);

  // Combine all senders from all pages
  const allSenders = useMemo(() => {
    return data?.flatMap((page) => page.uncategorizedSenders);
  }, [data]);

  // Check if there's more data to load by looking at the last page
  const hasMore = !!data?.[data.length - 1]?.nextOffset;

  return {
    data: allSenders,
    loadMore,
    isLoading,
    hasMore,
  };
}
