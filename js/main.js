// Main Entry Point
// Initializes the application and coordinates all modules

import { loadArcGISResources, ARCGIS_MODULES, appState } from './config.js';
import { hidePolygonMetadata } from './utils.js';
import {
    createLayers,
    initializeMap,
    initializeMapView,
    addMapWidgets,
    setupLayerLoadingHandlers,
    setupMapClickHandler
} from './map-setup.js';
import { highlightCadastralFrontage, addMarkerAtPoint, checkAndHandleSubPolygonClick, setupPINSearchListeners } from './cadastral-features.js';
import { reverseGeocode, setupAddressSearchListeners } from './location-services.js';
import { handleSubdivisionClick, isSubdivisionModeActive, setupSubdivisionListeners } from './subdivision-layer.js';
import { setupLayerControls, updateLayerControlIcons, initializeDefaultWesternPowerLayers } from './layer-controls.js';

/**
 * Initialize the application
 */
async function initializeApplication() {
    console.log('Initializing Asset Query with Map...');

    try {
        // Load ArcGIS resources (script and CSS)
        await loadArcGISResources();
        console.log('ArcGIS resources loaded');

        // Load ArcGIS modules using AMD require
        loadArcGISModules();
    } catch (error) {
        console.error('Failed to initialize application:', error);
        const loadingEl = document.getElementById('mapLoading');
        if (loadingEl) {
            loadingEl.innerHTML = '<p style="color: red;">Failed to load map library. Please refresh the page.</p>';
        }
    }
}

/**
 * Load ArcGIS modules using AMD require
 */
function loadArcGISModules() {
    require(ARCGIS_MODULES, function(
        esriConfig,
        Map,
        MapView,
        Graphic,
        GraphicsLayer,
        GeoJSONLayer,
        FeatureLayer,
        MapImageLayer,
        Point,
        TileLayer,
        BasemapToggle,
        Locate,
        Basemap,
        geometryEngine,
        reactiveUtils
    ) {
        // Package modules for easy passing
        const modules = {
            esriConfig,
            Map,
            MapView,
            Graphic,
            GraphicsLayer,
            GeoJSONLayer,
            FeatureLayer,
            MapImageLayer,
            Point,
            TileLayer,
            BasemapToggle,
            Locate,
            Basemap,
            geometryEngine,
            reactiveUtils
        };

        // Create all layers (use .then() instead of await since we can't use async here)
        createLayers({
            esriConfig,
            GraphicsLayer,
            GeoJSONLayer,
            FeatureLayer,
            MapImageLayer,
            TileLayer,
            Basemap,
            Graphic,
            geometryEngine,
            Point
        }).then(function(layers) {

            try {

            // Store layers in app state for global access
            appState.layers.graphics = layers.graphicsLayer;
            appState.layers.property = layers.propertyLayer;
            appState.layers.cadastre = layers.cadastreLayer;  // Cadastral_FS Layer 8 - Cadastre Polygon
            appState.layers.cadastreLines = layers.cadastreLinesLayer;  // Cadastral_FS Layer 7 - Lines with frontage
            appState.layers.lodgedCadastre = layers.lodgedCadastreLayer;  // Tenure_By_Polygon_FS Layer 2 - Polygons - Lodged
            appState.layers.lodgedCadastralLines = layers.lodgedCadastralLinesLayer;  // Tenure_By_Polygon_FS Layer 3 - Lines - Lodged
            appState.layers.setback = layers.setbackLayer;
            appState.layers.subdivision = layers.subdivisionLayer;
            appState.layers.electrical = layers.electricalLayer;

            // Store SLIP token and modules for lazy-loading Western Power layers
            appState.slipToken = layers.slipToken;  // Store SLIP token for manual queries and lazy-loading
            appState.arcgisModules = layers.modules;  // Store ArcGIS modules for lazy-loading

            // Western Power utility layers are NOT stored here - they are lazy-loaded when user toggles them on
            // This prevents unnecessary data fetching when Data Source is "None"

            // Initialize map
            appState.map = initializeMap(Map, layers);

            // Initialize map view
            appState.mapView = initializeMapView(MapView, appState.map);

            // Add map widgets
            addMapWidgets(
                appState.mapView,
                { BasemapToggle, Locate, Point, Graphic },
                layers,
                addMarkerAtPoint,
                reverseGeocode
            );

            // Setup layer loading handlers
            setupLayerLoadingHandlers(layers);

            // Hide loading indicator when map loads
            appState.mapView.when(function() {
                console.log('Map loaded successfully');
                const loadingEl = document.getElementById('mapLoading');
                if (loadingEl) {
                    loadingEl.style.display = 'none';
                }

                // Setup map click handler
                setupMapClickHandler(
                    appState.mapView,
                    layers,
                    { Point, Graphic, geometryEngine, reactiveUtils },
                    function(polygonGraphic, clickPoint) {
                        // Highlight frontage callback
                        highlightCadastralFrontage(
                            polygonGraphic,
                            clickPoint,
                            { Graphic, geometryEngine, Point },
                            reverseGeocode
                        );
                    },
                    addMarkerAtPoint,
                    reverseGeocode,
                    hidePolygonMetadata,
                    handleSubdivisionClick,
                    isSubdivisionModeActive,
                    function(hitTestResult, clickPoint) {
                        // Check and handle sub-polygon click callback
                        return checkAndHandleSubPolygonClick(
                            hitTestResult,
                            clickPoint,
                            { Graphic, geometryEngine, Point },
                            reverseGeocode
                        );
                    }
                );

                // Setup address search listeners
                setupAddressSearchListeners(Point, Graphic, addMarkerAtPoint);

                // Setup PIN search listeners
                setupPINSearchListeners({ Point, Graphic, geometryEngine });

                // Setup layer visibility controls
                setupLayerControls();

                // Update layer control icons to match initial visibility
                updateLayerControlIcons();

                // Initialize default Western Power layers (auto-load pillars)
                initializeDefaultWesternPowerLayers();

                // Setup subdivision mode button listeners
                setupSubdivisionListeners();

                // Pre-generation disabled - deprecated function incompatible with MapImageLayer
                // MapImageLayer (server-rendered) doesn't support feature queries needed for pre-generation
                // Electrical pillars are loaded from GeoJSON layer instead

                console.log('Application initialized successfully');
            }, function(error) {
                console.error('Error loading map:', error);
                const loadingEl = document.getElementById('mapLoading');
                if (loadingEl) {
                    loadingEl.innerHTML = '<p style="color: red;">Error loading map. Please refresh the page.</p>';
                }
            });

            } catch (error) {
                console.error('Error initializing map:', error);
                const loadingEl = document.getElementById('mapLoading');
                if (loadingEl) {
                    loadingEl.innerHTML = '<p style="color: red;">Error initializing map. Please refresh the page.</p>';
                }
            }
        }).catch(function(error) {
            console.error('Error creating layers:', error);
            const loadingEl = document.getElementById('mapLoading');
            if (loadingEl) {
                loadingEl.innerHTML = '<p style="color: red;">Error creating layers: ' + error.message + '</p>';
            }
        });
    }, function(error) {
        console.error('Error loading ArcGIS modules:', error);
        const loadingEl = document.getElementById('mapLoading');
        if (loadingEl) {
            loadingEl.innerHTML = '<p style="color: red;">Error loading ArcGIS modules: ' + error.message + '</p>';
        }
    });
}

// Initialize on document ready
document.addEventListener('DOMContentLoaded', initializeApplication);
