/**
 * Category A Selectors - Wind-Blown Dust Stabilization
 *
 * siTable:19 - No Yes/No question, just checkboxes for stabilization methods
 */

export const categoryA = {
  /** Checkbox: Maintain a soil crust */
  soilCrust: {
    yes: '[id="ThePage:siTable:19:sioTable:0:siForm:checkbox"]',
    no: "",
  },
  /** Checkbox: Maintain threshold friction velocity */
  tfv: {
    yes: '[id="ThePage:siTable:19:sioTable:1:siForm:checkbox"]',
    no: "",
  },
  /** Checkbox: Maintain vegetative ground cover */
  vegetative: {
    yes: '[id="ThePage:siTable:19:sioTable:2:siForm:checkbox"]',
    no: "",
  },
  /** Checkbox: Other stabilization */
  other: {
    yes: '[id="ThePage:siTable:19:sioTable:3:siForm:checkbox"]',
    no: "",
  },
  /** Textarea: Specify other (only if "Other" checked) */
  otherDescription: '[id="ThePage:siTable:19:sioTable:4:siForm:textarea"]',
} as const;
