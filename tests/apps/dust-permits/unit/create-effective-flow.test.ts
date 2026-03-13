import { afterEach, describe, expect, mock, test } from "bun:test";

const applicationModuleUrl = import.meta.resolve(
  "../../../../apps/dust-permits/src/portal/create/application.ts"
);
const constantsModuleUrl = import.meta.resolve(
  "../../../../apps/dust-permits/src/portal/create/constants.ts"
);
const fillModuleUrl = import.meta.resolve(
  "../../../../apps/dust-permits/src/portal/create/fill/index.ts"
);
const flowModuleUrl = import.meta.resolve(
  "../../../../apps/dust-permits/src/portal/create/flow.ts"
);
const helpersModuleUrl = import.meta.resolve(
  "../../../../apps/dust-permits/src/portal/utils/helpers.ts"
);
const actualHelpers = await import(helpersModuleUrl);

const state = {
  effectiveFlow: "new-company" as "new-company" | "existing-company",
  page1Modes: [] as string[],
};

const formData = {
  site: {
    acresDisturbed: 5,
  },
} as never;

function installFlowMocks() {
  const helperFactory = () => ({
    ...actualHelpers,
    SETTLE_MS: 0,
    clickNext: async () => {},
    navigateToMyDustApps: async () => true,
    sleep: async () => {},
    waitForElement: async () => true,
  });

  mock.module("@/portal/utils/helpers", helperFactory);
  mock.module(helpersModuleUrl, helperFactory);

  mock.module(constantsModuleUrl, () => ({
    DEFAULT_COPY_FROM_APP: "D0062461",
  }));

  mock.module(fillModuleUrl, () => ({
    checkExpedited: async () => true,
    clickPaymentContinue: async () => true,
    confirmPayment: async () => ({
      amount: "$100.00",
      cardLastFour: "1234",
      convenienceFee: "$5.00",
      totalPaid: "$105.00",
    }),
    fillPage1: async (_page: unknown, _data: unknown, mode: string) => {
      state.page1Modes.push(mode);
    },
    fillPage2: async () => true,
    fillPage2Renew: async () => true,
    fillPage2WithMapData: async () => true,
    fillPage3: async () => true,
    fillPage4: async () => true,
    fillPage5: async () => ({
      currentPage: 5,
      reachedPage5: true,
    }),
    fillPaymentPage1: async () => true,
    submitApplication: async () => ({
      applicationId: "D0099999",
      success: true,
    }),
  }));

  mock.module(applicationModuleUrl, () => ({
    createExistingCompanyApplication: async () => ({
      applicationId: "D0099999",
      effectiveFlow: state.effectiveFlow,
      success: true,
    }),
    createNewCompanyApplication: async () => ({
      applicationId: "D0099999",
      effectiveFlow: "new-company",
      success: true,
    }),
    createRenewApplication: async () => ({
      applicationId: "D0099999",
      success: true,
    }),
    createReviseApplication: async () => ({
      applicationId: "D0099999",
      success: true,
    }),
    getCreatedApplicationId: async () => "D0099999",
  }));
}

describe("createApplicationFull", () => {
  afterEach(() => {
    state.effectiveFlow = "new-company";
    state.page1Modes.length = 0;
    mock.restore();
  });

  test("fails fast when existing-company create unexpectedly falls back to new-company", async () => {
    installFlowMocks();

    const { createApplicationFull } = await import(
      `${flowModuleUrl}?fallback-to-new-company-${Date.now()}`
    );

    const result = await createApplicationFull(
      {} as never,
      {} as never,
      "existing-company",
      formData,
      { companyName: "STEVENS LEINWEBER CONSTRUCTION, INC." }
    );

    expect(result.success).toBe(false);
    expect(result.reachedPage5).toBe(false);
    expect(result.error).toContain("expected existing-company");
    expect(state.page1Modes).toEqual([]);
  });

  test("keeps partial page 1 mode when existing-company create stays existing-company", async () => {
    state.effectiveFlow = "existing-company";
    installFlowMocks();

    const { createApplicationFull } = await import(
      `${flowModuleUrl}?stay-existing-company-${Date.now()}`
    );

    const result = await createApplicationFull(
      {} as never,
      {} as never,
      "existing-company",
      formData,
      { companyName: "STEVENS LEINWEBER CONSTRUCTION, INC." }
    );

    expect(result.success).toBe(true);
    expect(result.reachedPage5).toBe(true);
    expect(state.page1Modes).toEqual(["partial"]);
  });
});
