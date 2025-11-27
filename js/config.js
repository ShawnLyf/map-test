// Configuration and Constants
// All application configuration in one place

// Western Australia geographic bounds
export const WA_BOUNDS = {
    xmin: 112.5,
    ymin: -35.5,
    xmax: 129.5,
    ymax: -13.5
};

// ArcGIS SLIP Service URLs
export const SLIP_SERVICES = {
    TENURE_POLYGON_FS: "https://token.slip.wa.gov.au/arcgis/rest/services/Landgate_v2_Subscription_Services/Tenure_By_Polygon_FS/FeatureServer",
    CADASTRE_FEATURESERVER: "https://token.slip.wa.gov.au/arcgis/rest/services/Landgate_v2_Subscription_Services/Cadastral_FS/MapServer",
    WP_UTILITIES: "https://token.slip.wa.gov.au/arcgis/rest/services/WP_Public_Secure_Services/WP_Public_Secure_Services_WFS/FeatureServer",
    TOKEN_ENDPOINT: "https://token.slip.wa.gov.au/arcgis/tokens/generateToken",
    SERVER_ROOT: "https://token.slip.wa.gov.au",
    // API endpoint for secure token generation (uses Azure Functions)
    API_TOKEN_ENDPOINT: "/api/slip-token"
};

// ArcGIS configuration
export const ARCGIS_VERSION = "4.28";
export const ARCGIS_CDN_BASE = "https://js.arcgis.com";

// Required ArcGIS modules
export const ARCGIS_MODULES = [
    "esri/config",
    "esri/Map",
    "esri/views/MapView",
    "esri/Graphic",
    "esri/layers/GraphicsLayer",
    "esri/layers/GeoJSONLayer",
    "esri/layers/FeatureLayer",
    "esri/layers/MapImageLayer",
    "esri/geometry/Point",
    "esri/layers/TileLayer",
    "esri/widgets/BasemapToggle",
    "esri/widgets/Locate",
    "esri/Basemap",
    "esri/geometry/geometryEngine",
    "esri/core/reactiveUtils"
];

// Global application state
export const appState = {
    map: null,
    mapView: null,
    slipToken: null, // SLIP authentication token for lazy-loading Western Power layers
    arcgisModules: null, // Store ArcGIS modules for lazy-loading
    layers: {
        graphics: null,
        property: null,
        cadastre: null, // Cadastral_FS Layer 8 - Cadastre Polygon (matches lines layer service)
        cadastreLines: null, // Cadastral_FS Layer 7 - Lines with frontage classification
        lodgedCadastre: null, // Tenure_By_Polygon_FS Layer 2 - Polygons - Lodged
        lodgedCadastralLines: null, // Tenure_By_Polygon_FS Layer 3 - Lines - Lodged
        setback: null,
        subdivision: null,
        electrical: null,
        // Western Power Utilities (all 18 layers from WP_Public_Secure_Services_WFS)
        // These are lazy-loaded when user toggles them on
        streetlights: null, // Layer 0 - WP-043
        transmissionPoles: null, // Layer 1 - WP-030
        utilityPoles: null, // Layer 2 - WP-029 (Distribution Poles)
        servicePits: null, // Layer 3 - WP-038
        pillars: null, // Layer 4 - WP-041 (Electrical Pillars - used for connection points)
        utilityTransformers: null, // Layer 5 - WP-039
        otherOverhead: null, // Layer 6 - WP-033
        otherUnderground: null, // Layer 7 - WP-036
        utilityUndergroundCables: null, // Layer 8 - WP-034 (Distribution Underground Cables)
        transmissionUnderground: null, // Layer 9 - WP-035
        utilityOverheadPowerlines: null, // Layer 10 - WP-031 (Distribution Overhead Powerlines)
        transmissionOverhead: null, // Layer 11 - WP-032
        undergroundStructures: null, // Layer 12 - WP-037
        enclosures: null, // Layer 13 - WP-040
        restrictionZones: null, // Layer 14 - WP-044
        substations: null, // Layer 15 - WP-046
        ugProjectAreas: null, // Layer 16 - WP-047
        ugProjectZones: null // Layer 17 - WP-048
    },
    currentMarker: null,
    currentLocation: {
        lat: null,
        lng: null,
        address: null
    },
    currentPolygon: null,
    currentFrontageLines: [], // Store frontage lines for current polygon
    subPolygonData: null, // Store subdivided polygon data with frontage
    suggestionsList: null
};

// Western Power Utilities Layer Configuration
// Maps layer IDs to their configuration
export const WESTERN_POWER_LAYERS = {
    streetlights: { id: 0, code: 'WP-043', name: 'Streetlights', icon: '💡', color: [255, 255, 0, 0.9] },
    transmissionPoles: { id: 1, code: 'WP-030', name: 'Transmission Poles', icon: '🗼', color: [139, 69, 19, 0.8] },
    utilityPoles: { id: 2, code: 'WP-029', name: 'Distribution Poles', icon: '📍', color: [139, 69, 19, 0.8] },
    servicePits: { id: 3, code: 'WP-038', name: 'Electrical Service Pits', icon: '⬛', color: [64, 64, 64, 0.8] },
    pillars: { id: 4, code: 'WP-041', name: 'Electrical Pillars', icon: '💎', color: [0, 200, 0, 0.8] },
    utilityTransformers: { id: 5, code: 'WP-039', name: 'Electrical Transformers', icon: '⚡', color: [255, 165, 0, 0.9] },
    otherOverhead: { id: 6, code: 'WP-033', name: 'Other Overhead Lines', icon: '〰️', color: [255, 140, 0, 0.7] },
    otherUnderground: { id: 7, code: 'WP-036', name: 'Other Underground Cables', icon: '⏸️', color: [128, 0, 128, 0.6] },
    utilityUndergroundCables: { id: 8, code: 'WP-034', name: 'Distribution Underground Cables', icon: '⏸️', color: [128, 0, 128, 0.7] },
    transmissionUnderground: { id: 9, code: 'WP-035', name: 'Transmission Underground Cables', icon: '⏸️', color: [148, 0, 211, 0.7] },
    utilityOverheadPowerlines: { id: 10, code: 'WP-031', name: 'Distribution Overhead Powerlines', icon: '〰️', color: [255, 140, 0, 0.8] },
    transmissionOverhead: { id: 11, code: 'WP-032', name: 'Transmission Overhead Powerlines', icon: '〰️', color: [255, 69, 0, 0.8] },
    undergroundStructures: { id: 12, code: 'WP-037', name: 'Underground Structures', icon: '🔲', color: [64, 64, 64, 0.8] },
    enclosures: { id: 13, code: 'WP-040', name: 'Electrical Enclosures', icon: '📦', color: [192, 192, 192, 0.8] },
    restrictionZones: { id: 14, code: 'WP-044', name: 'Restriction Zones', icon: '🚫', color: [255, 0, 0, 0.3] },
    substations: { id: 15, code: 'WP-046', name: 'Substations/Terminals/Power Stations', icon: '🏭', color: [220, 20, 60, 0.8] },
    ugProjectAreas: { id: 16, code: 'WP-047', name: 'Underground Power Project Areas', icon: '🔶', color: [255, 215, 0, 0.4] },
    ugProjectZones: { id: 17, code: 'WP-048', name: 'Underground Power Project Zones', icon: '🔷', color: [30, 144, 255, 0.4] }
};

// Load ArcGIS resources
export function loadArcGISResources() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${ARCGIS_CDN_BASE}/${ARCGIS_VERSION}/`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load ArcGIS library'));
        document.head.appendChild(script);

        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = `${ARCGIS_CDN_BASE}/${ARCGIS_VERSION}/esri/themes/light/main.css`;
        document.head.appendChild(cssLink);
    });
}
