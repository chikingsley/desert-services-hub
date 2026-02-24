"use client";

import { subDays } from "date-fns/subDays";
import {
  ArchiveIcon,
  CheckIcon,
  ChevronDown,
  ChevronsDownIcon,
  ChevronsUpIcon,
  InboxIcon,
  ListIcon,
  MailXIcon,
  ThumbsUpIcon,
} from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import useSWR from "swr";
import { useWindowSize } from "usehooks-ts";
import { ArchiveProgress } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/ArchiveProgress";
import { BulkActions } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/BulkActions";
import {
  BulkUnsubscribeDesktop,
  BulkUnsubscribeRowDesktop,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/BulkUnsubscribeDesktop";
import {
  BulkUnsubscribeMobile,
  BulkUnsubscribeRowMobile,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/BulkUnsubscribeMobile";
import {
  BulkUnsubscribeDesktopSkeleton,
  BulkUnsubscribeMobileSkeleton,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/BulkUnsubscribeSkeleton";
import {
  type NewsletterFilterType,
  useBulkUnsubscribeShortcuts,
  useNewsletterFilter,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks";
import { SearchBar } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/SearchBar";
import { ActionBar } from "@/app/(app)/[emailAccountId]/stats/ActionBar";
import { useEmailsToIncludeFilter } from "@/app/(app)/[emailAccountId]/stats/EmailsToIncludeFilter";
import { LoadStatsButton } from "@/app/(app)/[emailAccountId]/stats/LoadStatsButton";
import { NewsletterModal } from "@/app/(app)/[emailAccountId]/stats/NewsletterModal";
import { getDateRangeParams } from "@/app/(app)/[emailAccountId]/stats/params";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import type {
  NewsletterStatsQuery,
  NewsletterStatsResponse,
} from "@/app/api/user/stats/newsletters/route";
import { ClientOnly } from "@/components/ClientOnly";
import { DatePickerWithRange } from "@/components/DatePickerWithRange";
import { LoadingContent } from "@/components/LoadingContent";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { usePremium } from "@/components/PremiumAlert";
import { TextLink } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DismissibleVideoCard } from "@/components/VideoCard";
import { useLabels } from "@/hooks/useLabels";
import { useToggleSelect } from "@/hooks/useToggleSelect";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useStatLoader } from "@/providers/StatLoaderProvider";

type Newsletter = NewsletterStatsResponse["newsletters"][number];

const filterOptions: {
  label: string;
  value: NewsletterFilterType;
  icon: React.ReactNode;
  separatorAfter?: boolean;
}[] = [
  {
    label: "Unhandled",
    value: "unhandled",
    icon: <InboxIcon className="size-4" />,
  },
  {
    label: "All",
    value: "all",
    icon: <ListIcon className="size-4" />,
    separatorAfter: true,
  },
  {
    label: "Unsubscribed",
    value: "unsubscribed",
    icon: <MailXIcon className="size-4" />,
  },
  {
    label: "Auto Archive",
    value: "autoArchived",
    icon: <ArchiveIcon className="size-4" />,
  },
  {
    label: "Approved",
    value: "approved",
    icon: <ThumbsUpIcon className="size-4" />,
  },
];

const selectOptions = [
  { label: "Last week", value: "7" },
  { label: "Last month", value: "30" },
  { label: "Last 3 months", value: "90" },
  { label: "Last year", value: "365" },
  { label: "All", value: "0" },
];
const defaultSelected = selectOptions[2];

export function BulkUnsubscribe() {
  const windowSize = useWindowSize();
  const isMobile = windowSize.width < 768;

  const [dateDropdown, setDateDropdown] = useState<string>(
    defaultSelected.label
  );

  const now = useMemo(() => new Date(), []);

  const onSetDateDropdown = useCallback(
    (option: { label: string; value: string }) => {
      const { label, value } = option;
      setDateDropdown(label);
      // When "All" is selected (value "0"), set dateRange to undefined to skip date filtering
      if (value === "0") {
        setDateRange(undefined);
      } else {
        setDateRange({
          from: subDays(now, Number.parseInt(value)),
          to: now,
        });
      }
    },
    [now]
  );

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(now, Number.parseInt(defaultSelected.value)),
    to: now,
  });

  const { isLoading: isStatsLoaderLoading, onLoad } = useStatLoader();
  const refreshInterval = isStatsLoaderLoading ? 5000 : 1_000_000;
  useEffect(() => {
    onLoad({ loadBefore: false, showToast: false });
  }, [onLoad]);

  const { emailAccountId, userEmail } = useAccount();

  const [sortColumn, setSortColumn] = useState<
    "emails" | "unread" | "unarchived"
  >("emails");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const handleSort = useCallback(
    (column: "emails" | "unread" | "unarchived") => {
      if (sortColumn === column) {
        // Toggle direction if clicking the same column
        setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
      } else {
        // Set new column with default desc direction
        setSortColumn(column);
        setSortDirection("desc");
      }
    },
    [sortColumn]
  );

  const { typesArray } = useEmailsToIncludeFilter();
  const { filtersArray, filter, setFilter } = useNewsletterFilter();
  const posthog = usePostHog();

  const [search, setSearch] = useState("");

  const [expanded, setExpanded] = useState(false);

  const params: NewsletterStatsQuery = {
    types: typesArray,
    filters: filtersArray,
    orderBy: sortColumn,
    orderDirection: sortDirection,
    limit: expanded ? 500 : 50,
    includeMissingUnsubscribe: true,
    ...getDateRangeParams(dateRange),
    ...(search ? { search } : {}),
  };
  // biome-ignore lint/suspicious/noExplicitAny: simplest
  const urlParams = new URLSearchParams(params as any);
  const { data, isLoading, isValidating, error, mutate } = useSWR<
    NewsletterStatsResponse,
    { error: string }
  >(`/api/user/stats/newsletters?${urlParams}`, {
    refreshInterval,
    keepPreviousData: true,
  });

  // Track whether we're switching views (filter, sort, search, date range, expanded)
  // Show skeleton when validating with different params, not on background refresh
  const [lastFetchedParams, setLastFetchedParams] = useState<string>("");
  const currentParamsString = urlParams.toString();
  const isParamsChanged = lastFetchedParams !== currentParamsString;
  const showSkeleton = isValidating && isParamsChanged;

  // Update lastFetchedParams when data arrives for new params
  useEffect(() => {
    if (!isValidating && data) {
      setLastFetchedParams(currentParamsString);
    }
  }, [isValidating, data, currentParamsString]);

  const { hasUnsubscribeAccess, mutate: refetchPremium } = usePremium();

  const [openedNewsletter, setOpenedNewsletter] = useState<Newsletter>();

  const onOpenNewsletter = (newsletter: Newsletter) => {
    setOpenedNewsletter(newsletter);
    posthog?.capture("Clicked Expand Sender");
  };

  const [selectedRow, setSelectedRow] = useState<Newsletter | undefined>();

  useBulkUnsubscribeShortcuts({
    newsletters: data?.newsletters,
    selectedRow,
    onOpenNewsletter,
    setSelectedRow,
    refetchPremium,
    hasUnsubscribeAccess,
    mutate,
    userEmail,
    emailAccountId,
  });

  const { isLoading: isStatsLoading } = useStatLoader();

  const { userLabels } = useLabels();

  const { PremiumModal, openModal } = usePremiumModal();

  const RowComponent = isMobile
    ? BulkUnsubscribeRowMobile
    : BulkUnsubscribeRowDesktop;

  // Data is now filtered, sorted, and limited by the backend
  const rows = data?.newsletters;

  const {
    selected,
    isAllSelected,
    onToggleSelect,
    onToggleSelectAll,
    clearSelection,
    deselectItem,
  } = useToggleSelect(rows?.map((item) => ({ id: item.name })) || []);

  // Clear selection when filter changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally clearing selection when filter changes
  useEffect(() => {
    clearSelection();
  }, [filter]);

  const isSomeSelected =
    Array.from(selected.values()).filter(Boolean).length > 0;

  // Backend now handles sorting, so we just map the rows in order
  const tableRows = rows?.map((item) => {
    const readPercentage =
      item.value > 0 ? (item.readEmails / item.value) * 100 : 0;
    const archivedEmails = item.value - item.inboxEmails;
    const archivedPercentage =
      item.value > 0 ? (archivedEmails / item.value) * 100 : 0;

    return (
      <RowComponent
        archivedEmails={archivedEmails}
        archivedPercentage={archivedPercentage}
        checked={selected.get(item.name)}
        emailAccountId={emailAccountId}
        filter={filter}
        hasUnsubscribeAccess={hasUnsubscribeAccess}
        item={item}
        key={item.name}
        labels={userLabels}
        mutate={mutate}
        onDoubleClick={() => onOpenNewsletter(item)}
        onOpenNewsletter={onOpenNewsletter}
        onSelectRow={() => setSelectedRow(item)}
        onToggleSelect={onToggleSelect}
        openPremiumModal={openModal}
        readPercentage={readPercentage}
        refetchPremium={refetchPremium}
        selected={selectedRow?.name === item.name}
        userEmail={userEmail}
      />
    );
  });

  const selectedFilter = filterOptions.find((opt) => opt.value === filter);

  return (
    <PageWrapper>
      <PageHeader
        title="Bulk Unsubscriber"
        video={{
          title: "Getting started with Bulk Unsubscribe",
          description: (
            <>
              Learn how to quickly bulk unsubscribe from and archive unwanted
              emails. You can read more in our{" "}
              <TextLink
                href="https://docs.getinboxzero.com/essentials/bulk-email-unsubscriber"
                rel="noopener noreferrer"
                target="_blank"
              >
                help center
              </TextLink>
              .
            </>
          ),
          youtubeVideoId: "T1rnooV4OYc",
        }}
      />

      <DismissibleVideoCard
        className="my-4"
        description={
          "Learn how to use the Bulk Unsubscribe to unsubscribe from and archive unwanted emails."
        }
        icon={<ArchiveIcon className="size-5" />}
        storageKey="bulk-unsubscribe-onboarding-video"
        thumbnailSrc="https://img.youtube.com/vi/T1rnooV4OYc/0.jpg"
        title="Getting started with Bulk Unsubscribe"
        videoSrc="https://www.youtube.com/embed/T1rnooV4OYc"
      />

      <div className="mt-4 flex flex-wrap items-center justify-between">
        <ActionBar rightContent={<LoadStatsButton />}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-10" size="sm" variant="outline">
                {selectedFilter?.icon}
                <span className="ml-2">{selectedFilter?.label ?? "All"}</span>
                <ChevronDown className="ml-2 h-4 w-4 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[170px]">
              {filterOptions.map((option) => (
                <div key={option.value}>
                  <DropdownMenuItem
                    className="flex items-center justify-between"
                    onClick={() => setFilter(option.value)}
                  >
                    <span className="flex items-center gap-2">
                      {option.icon}
                      {option.label}
                    </span>
                    {filter === option.value && (
                      <CheckIcon className="h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                  {option.separatorAfter && <DropdownMenuSeparator />}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DatePickerWithRange
            dateDropdown={dateDropdown}
            dateRange={dateRange}
            onSetDateDropdown={onSetDateDropdown}
            onSetDateRange={setDateRange}
            selectOptions={selectOptions}
          />
          <SearchBar onSearch={setSearch} />
        </ActionBar>
      </div>

      <ClientOnly>
        <ArchiveProgress />
      </ClientOnly>

      <BulkActions
        deselectItem={deselectItem}
        filter={filter}
        mutate={mutate}
        newsletters={rows}
        onClearSelection={clearSelection}
        selected={selected}
        totalCount={rows?.length ?? 0}
      />

      <Card className="mt-2 md:mt-4">
        {isStatsLoading && !isLoading && !data?.newsletters.length ? (
          isMobile ? (
            <BulkUnsubscribeMobileSkeleton />
          ) : (
            <BulkUnsubscribeDesktopSkeleton />
          )
        ) : showSkeleton ? (
          isMobile ? (
            <BulkUnsubscribeMobileSkeleton />
          ) : (
            <BulkUnsubscribeDesktopSkeleton />
          )
        ) : (
          <LoadingContent
            error={error}
            loading={!data && isLoading}
            loadingComponent={
              isMobile ? (
                <BulkUnsubscribeMobileSkeleton />
              ) : (
                <BulkUnsubscribeDesktopSkeleton />
              )
            }
          >
            {tableRows?.length ? (
              <>
                {isMobile ? (
                  <BulkUnsubscribeMobile tableRows={tableRows} />
                ) : (
                  <BulkUnsubscribeDesktop
                    isAllSelected={isAllSelected}
                    isSomeSelected={isSomeSelected}
                    onSort={handleSort}
                    onToggleSelectAll={onToggleSelectAll}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    tableRows={tableRows}
                  />
                )}
                {/* Only show expand/collapse when there might be more results */}
                {(expanded || (rows && rows.length >= 50)) && (
                  <div className="mt-2 px-6 pb-6">
                    <Button
                      className="w-full"
                      onClick={() => setExpanded(!expanded)}
                      size="sm"
                      variant="outline"
                    >
                      {expanded ? (
                        <>
                          <ChevronsUpIcon className="h-4 w-4" />
                          <span className="ml-2">Show less</span>
                        </>
                      ) : (
                        <>
                          <ChevronsDownIcon className="h-4 w-4" />
                          <span className="ml-2">Show more</span>
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center px-4 py-16">
                <InboxIcon className="h-16 w-16 text-gray-300" />
                <h3 className="mt-4 font-semibold text-lg">No emails found</h3>
                <p className="mt-2 text-center text-muted-foreground">
                  Adjust the filters or click "Load More" to load additional
                  emails.
                </p>
              </div>
            )}
          </LoadingContent>
        )}
      </Card>
      <NewsletterModal
        mutate={mutate}
        newsletter={openedNewsletter}
        onClose={() => setOpenedNewsletter(undefined)}
        refreshInterval={refreshInterval}
      />
      <PremiumModal />
    </PageWrapper>
  );
}
