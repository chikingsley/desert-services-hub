// Shared pdfmake table layout definitions
// Use 0.5pt borders so adjacent tables (0.5 + 0.5 = 1pt) look normal

import type { CustomTableLayout } from "pdfmake/interfaces";
import { COLORS } from "./brand";

/** Standard 0.5pt black borders */
export const borderedLayout: CustomTableLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => "#000",
  vLineColor: () => "#000",
};

/** No borders at all */
export const noBordersLayout: CustomTableLayout = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
};

/** No borders and zero padding on all sides */
export const noPaddingLayout: CustomTableLayout = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0,
};

/** Card borders for callout boxes — uses semantic border token */
export const cardLayout: CustomTableLayout = {
  hLineWidth: () => 1,
  vLineWidth: () => 1,
  hLineColor: () => COLORS.border,
  vLineColor: () => COLORS.border,
};
