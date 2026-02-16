/**
 * Category A Selectors - Wind-Blown Dust Stabilization
 *
 * siTable:19 - No Yes/No question, just checkboxes for stabilization methods
 */

export const categoryA = {
  /** Checkbox: Maintain a soil crust */
  soilCrust: {
    no: "",
    yes: '[id="ThePage:siTable:19:sioTable:0:siForm:checkbox"]',
  },
  /** Checkbox: Maintain threshold friction velocity */
  tfv: {
    no: "",
    yes: '[id="ThePage:siTable:19:sioTable:1:siForm:checkbox"]',
  },
  /** Checkbox: Maintain vegetative ground cover */
  vegetative: {
    no: "",
    yes: '[id="ThePage:siTable:19:sioTable:2:siForm:checkbox"]',
  },
  /** Checkbox: Other stabilization */
  other: {
    no: "",
    yes: '[id="ThePage:siTable:19:sioTable:3:siForm:checkbox"]',
  },
  /** Textarea: Specify other (only if "Other" checked) */
  otherDescription: '[id="ThePage:siTable:19:sioTable:4:siForm:textarea"]',
} as const;
