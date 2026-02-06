/**
 * Page 2 - Project Location Selectors
 *
 * ESRI Map selectors for the gis.maricopa.gov iframe.
 * These are separate from the main portal selectors because they live
 * inside a cross-origin iframe.
 *
 * NOT part of SelectorMap (FormData) - these are workflow/navigation selectors
 * like portal.ts.
 */

/** ESRI Map Selectors (inside gis.maricopa.gov iframe) */
export const esriMap = {
  // Search
  searchInput: "#esri_dijit_Search_0_input",
  searchSubmit: ".searchBtn",

  // Basemap gallery (in BoxController toolbar on right side)
  basemapBtn: '.jimu-widget-onscreen-icon[data-widget-name="BasemapGallery"]',
  basemapBtnAlt: "#widgets_BasemapGallery_Widget_61",
  basemapGallery: "#esri_dijit_BasemapGallery_0",

  // Imagery/Satellite options
  imageryOption: 'img.esriBasemapGalleryThumbnail[title*="Imagery"]',
  aerialOption: 'img.esriBasemapGalleryThumbnail[title*="Aerial"]',
  countyAerialOption:
    'img.esriBasemapGalleryThumbnail[title="County Aerial Photography"]',

  // Box Controller toolbar
  boxController: "#widgets_BoxController_Widget_66",

  // Drawing tools - left panel
  disturbedAreaTool: "#tpick-surface-30",
  editBtn: '[id*="Edit"]',
  editWidget: "#widgets_Edit_Widget_62",
  editWidgetAlt: ".jimu-widget-edit",
  editWidgetName: "[data-widget-name='Edit']",

  // Map canvas
  mapContainer: "#map_container",
  mapCanvas: "#map_container canvas",

  // Template picker - used for drawing mode selection
  templatePickerItems: "[id^='tpick-surface-']",
} as const;

/** Map popup selectors (in the dustSiteLocation.jsf popup) */
export const mapPopup = {
  saveAndCloseBtn: 'img[alt="Save and Close"]',
  cancelBtn: 'img[alt="Cancel"]',
  esriIframe: 'iframe[src*="gis.maricopa.gov"]',
} as const;
