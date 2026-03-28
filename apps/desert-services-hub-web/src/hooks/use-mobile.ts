import * as React from "react";

const MOBILE_BREAKPOINT = 768;

const getMobileSnapshot = (): boolean => window.innerWidth < MOBILE_BREAKPOINT;

const getServerSnapshot = (): boolean => false;

const subscribeToViewport = (onStoreChange: () => void): (() => void) => {
  const mediaQueryList = window.matchMedia(
    `(max-width: ${MOBILE_BREAKPOINT - 1}px)`
  );

  mediaQueryList.addEventListener("change", onStoreChange);

  return () => mediaQueryList.removeEventListener("change", onStoreChange);
};

export const useIsMobile = (): boolean =>
  React.useSyncExternalStore(
    subscribeToViewport,
    getMobileSnapshot,
    getServerSnapshot
  );
