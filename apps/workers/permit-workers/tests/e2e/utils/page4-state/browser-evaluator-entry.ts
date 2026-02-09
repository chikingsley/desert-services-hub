/**
 * Browser-side Page 4 evaluator entrypoint.
 *
 * This module is bundled to a self-contained IIFE and injected into Playwright
 * pages. It registers a global evaluator function that computes the full Page 4
 * state from selectors, without runtime `new Function` reconstruction.
 */

import type { Page4State, SelectorMap } from "@/form-data";
import { getCategoryAState } from "./category-a";
import { getCategoryBState } from "./category-b";
import { getCategoryCState } from "./category-c";
import { getCategoryDState } from "./category-d";
import { getCategoryEState } from "./category-e";
import { getCategoryFState } from "./category-f";
import { getCategoryGState } from "./category-g";
import { getCategoryHState } from "./category-h";
import { getCategoryIState } from "./category-i";
import { getCategoryJState } from "./category-j";
import { getCategoryKState } from "./category-k";
import { getPostKState } from "./category-post-k";
import { createValidationHelpers } from "./helpers";

type Page4StateEvaluator = (selectors: SelectorMap) => Page4State;

type EvaluatorGlobal = typeof globalThis & {
  __DS_GET_PAGE4_STATE__?: Page4StateEvaluator;
};

const TOTAL_DISTURBED_ACRES_SELECTOR =
  '[id="ThePage:siTable:54:sioTable:0:siForm:text"]';

function evaluatePage4State(selectors: SelectorMap): Page4State {
  const helpers = createValidationHelpers();

  const stateB = getCategoryBState(selectors, helpers);
  const stateC = getCategoryCState(selectors, helpers);
  const stateD = getCategoryDState(selectors, helpers);
  const stateE = getCategoryEState(selectors, helpers);
  const stateF = getCategoryFState(selectors, helpers);
  const stateG = getCategoryGState(selectors, helpers);
  const stateI = getCategoryIState(selectors, helpers);

  const totalAcresEl = document.querySelector(
    TOTAL_DISTURBED_ACRES_SELECTOR
  ) as HTMLInputElement | null;
  const hasTotalDisturbedAcres = (totalAcresEl?.value?.trim().length ?? 0) > 0;

  return {
    categoryA: getCategoryAState(selectors, helpers),
    categoryB1: stateB.categoryB1,
    categoryB2: stateB.categoryB2,
    categoryC1: stateC.categoryC1,
    categoryC2: stateC.categoryC2,
    categoryC3: stateC.categoryC3,
    categoryC4: stateC.categoryC4,
    categoryD1: stateD.categoryD1,
    categoryD2: stateD.categoryD2,
    categoryD3: stateD.categoryD3,
    categoryD4: stateD.categoryD4,
    categoryD5: stateD.categoryD5,
    categoryE1: stateE.categoryE1,
    categoryE2: stateE.categoryE2,
    categoryF1: stateF.categoryF1,
    categoryF2: stateF.categoryF2,
    categoryG1: stateG.categoryG1,
    categoryG2: stateG.categoryG2,
    categoryH: getCategoryHState(selectors, helpers),
    categoryI1: stateI.categoryI1,
    categoryI2: stateI.categoryI2,
    categoryJ: getCategoryJState(selectors, helpers),
    categoryK: getCategoryKState(selectors, helpers),
    postK: getPostKState(selectors, helpers),
    hasTotalDisturbedAcres,
  };
}

const evaluatorGlobal = globalThis as EvaluatorGlobal;
if (typeof evaluatorGlobal.__DS_GET_PAGE4_STATE__ !== "function") {
  evaluatorGlobal.__DS_GET_PAGE4_STATE__ = evaluatePage4State;
}
