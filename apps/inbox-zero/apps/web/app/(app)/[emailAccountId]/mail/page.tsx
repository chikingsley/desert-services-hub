"use client";

import { useSetAtom } from "jotai";
import { use, useCallback, useEffect } from "react";
import useSWRInfinite from "swr/infinite";
import { BetaBanner } from "@/app/(app)/[emailAccountId]/mail/BetaBanner";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import type { ThreadsResponse } from "@/app/api/threads/route";
import type { ThreadsQuery } from "@/app/api/threads/validation";
import { ClientOnly } from "@/components/ClientOnly";
import { List } from "@/components/email-list/EmailList";
import { LoadingContent } from "@/components/LoadingContent";
import { refetchEmailListAtom } from "@/store/email";

export default function Mail(props: {
  searchParams: Promise<{ type?: string; labelId?: string }>;
}) {
  const searchParams = use(props.searchParams);

  const getKey = (
    pageIndex: number,
    previousPageData: ThreadsResponse | null
  ) => {
    if (previousPageData && !previousPageData.nextPageToken) {
      return null;
    }

    const query: ThreadsQuery = {};

    // Handle different query params
    if (searchParams.type === "label" && searchParams.labelId) {
      query.labelId = searchParams.labelId;
    } else if (searchParams.type) {
      query.type = searchParams.type;
    }

    // Append nextPageToken for subsequent pages
    if (pageIndex > 0 && previousPageData?.nextPageToken) {
      query.nextPageToken = previousPageData.nextPageToken;
    }

    // biome-ignore lint/suspicious/noExplicitAny: params
    const queryParams = new URLSearchParams(query as any);

    return `/api/threads?${queryParams.toString()}`;
  };

  const { data, size, setSize, isLoading, error, mutate } =
    useSWRInfinite<ThreadsResponse>(getKey, {
      keepPreviousData: true,
      dedupingInterval: 1000,
      revalidateOnFocus: false,
    });

  const allThreads = data ? data.flatMap((page) => page.threads) : [];
  const isLoadingMore =
    isLoading || (size > 0 && data && typeof data[size - 1] === "undefined");
  const showLoadMore = data ? !!data[data.length - 1]?.nextPageToken : false;

  // store `refetch` in the atom so we can refresh the list upon archive via command k
  // TODO is this the best way to do this?
  const refetch = useCallback(
    (options?: { removedThreadIds?: string[] }) => {
      mutate(
        (currentData) => {
          if (!currentData) {
            return currentData;
          }
          if (!options?.removedThreadIds) {
            return currentData;
          }

          return currentData.map((page) => ({
            ...page,
            threads: page.threads.filter(
              (t) => !options?.removedThreadIds?.includes(t.id)
            ),
          }));
        },
        {
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        }
      );
    },
    [mutate]
  );

  // Set up the refetch function in the atom store
  const setRefetchEmailList = useSetAtom(refetchEmailListAtom);
  useEffect(() => {
    setRefetchEmailList({ refetch });
  }, [refetch, setRefetchEmailList]);

  const handleLoadMore = useCallback(() => {
    setSize((size) => size + 1);
  }, [setSize]);

  return (
    <>
      <PermissionsCheck />
      <ClientOnly>
        <BetaBanner />
      </ClientOnly>
      <LoadingContent error={error} loading={isLoading && !data}>
        {allThreads && (
          <List
            emails={allThreads}
            handleLoadMore={handleLoadMore}
            isLoadingMore={isLoadingMore}
            refetch={refetch}
            showLoadMore={showLoadMore}
            type={searchParams.type}
          />
        )}
      </LoadingContent>
    </>
  );
}
