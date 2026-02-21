import type { ArcGisLayerConfig } from "./arcgis-types";

export const DEFAULT_ARCGIS_SERVICES_BASE_URL =
  "https://services.arcgis.com/SzoH1oFM2apCSkx3/ArcGIS/rest/services";

export const ARCGIS_LAYERS: readonly ArcGisLayerConfig[] = [
  {
    key: "AZPDES:0",
    serviceName: "AZPDES",
    layerId: 0,
    layerName: "AZPDES Construction",
  },
  {
    key: "AZPDES:1",
    serviceName: "AZPDES",
    layerId: 1,
    layerName: "AZPDES De Minimus",
  },
  {
    key: "AZPDES:2",
    serviceName: "AZPDES",
    layerId: 2,
    layerName: "AZPDES Multi-Sector",
  },
  {
    key: "AZPDES:3",
    serviceName: "AZPDES",
    layerId: 3,
    layerName: "AZPDES myDEQ CGP",
  },
  {
    key: "AZPDES:4",
    serviceName: "AZPDES",
    layerId: 4,
    layerName: "AZPDES myDEQ DMGP",
  },
  {
    key: "AZPDES:5",
    serviceName: "AZPDES",
    layerId: 5,
    layerName: "AZPDES myDEQ MSGP",
  },
  {
    key: "AZPDES_Individual_Permits:0",
    serviceName: "AZPDES_Individual_Permits",
    layerId: 0,
    layerName: "AZPDES Individual Permits",
  },
  {
    key: "Dust_Visibility_Construction_Notification_Area:0",
    serviceName: "Dust_Visibility_Construction_Notification_Area",
    layerId: 0,
    layerName: "Dust Visibility Construction Notification Area",
  },
] as const;

export const ARCGIS_LAYER_BY_KEY = new Map(
  ARCGIS_LAYERS.map((layer) => [layer.key, layer])
);

export const DEFAULT_ARCGIS_PAGE_SIZE = 1000;
