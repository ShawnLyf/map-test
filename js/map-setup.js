// Map Setup
// Map initialization, layer creation, and widget configuration

import { appState, WA_BOUNDS, SLIP_SERVICES, WESTERN_POWER_LAYERS } from './config.js';
import { isInWesternAustralia } from './utils.js';
import { removeAllPotentialNodes, clearAllElectricalNodeGraphics } from './electrical-infrastructure.js';

// Constants - Layer Colors
const LAYER_COLORS = {
    CADASTRE_FILL: [255, 255, 255],
    CADASTRE_OUTLINE_RED: [255, 0, 0],
    PROPERTY_MARKER_BLUE: [0, 122, 194],
    FRONTAGE_GREEN: [0, 255, 0],
    INTERIOR_GRAY: [128, 128, 128],
    DEFAULT_GRAY: [200, 200, 200]
};

// Constants - Layer Styles
const LAYER_STYLES = {
    CADASTRE_OUTLINE_WIDTH: 1.5,
    PROPERTY_MARKER_SIZE: "6px",
    FRONTAGE_LINE_WIDTH: 3,
    INTERIOR_LINE_WIDTH: 1,
    DEFAULT_LINE_WIDTH: 0.5
};

// Constants - Map Configuration
const MAP_CONFIG = {
    PERTH_CENTER: [115.701866, -32.804937],
    DEFAULT_ZOOM: 12,
    MIN_ZOOM: 8,
    MAX_ZOOM: 20,
    LOCATE_SCALE: 1500
};

// Constants - Basemap URLs
const BASEMAP_URLS = {
    STREET: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer",
    SATELLITE: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer"
};

/**
 * Escape HTML to prevent XSS attacks
 */
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

/**
 * Generate popup content from attributes (safe HTML generation)
 */
function generateAttributesPopup(attributes, customHeader = null) {
    const parts = ['<div style="padding: 10px;">'];

    if (customHeader) {
        parts.push(customHeader);
    }

    for (let key in attributes) {
        if (attributes.hasOwnProperty(key)) {
            const safeKey = escapeHtml(key);
            const safeValue = escapeHtml(attributes[key]);
            parts.push(`<p><strong>${safeKey}:</strong> ${safeValue}</p>`);
        }
    }

    parts.push('</div>');
    return parts.join('');
}

/**
 * Generate token directly from SLIP service using user-provided credentials
 * This is a fallback when the API endpoint is not configured
 */
async function generateSLIPTokenFromCredentials(username, password) {
    console.log('Generating SLIP token directly from credentials...');

    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    formData.append('referer', SLIP_SERVICES.SERVER_ROOT);
    formData.append('f', 'json');
    formData.append('expiration', '60'); // Token valid for 60 minutes

    try {
        const response = await fetch(SLIP_SERVICES.TOKEN_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        });

        const data = await response.json();

        if (data.error) {
            console.error('SLIP authentication error:', data.error);
            throw new Error(`SLIP authentication failed: ${data.error.message || 'Invalid credentials'}`);
        }

        if (!data.token) {
            throw new Error('No token received from SLIP service');
        }

        console.log('✅ Token generated successfully from credentials');
        return data.token;
    } catch (error) {
        console.error('Error generating token from credentials:', error);
        throw error;
    }
}

/**
 * Prompt user for SLIP credentials using secure modal dialog
 */
function promptForCredentials() {
    return new Promise((resolve, reject) => {
        const modal = document.getElementById('slipCredentialsModal');
        const usernameInput = document.getElementById('slipUsername');
        const passwordInput = document.getElementById('slipPassword');
        const submitBtn = document.getElementById('slipCredentialsSubmit');
        const cancelBtn = document.getElementById('slipCredentialsCancel');

        // Clear previous values
        usernameInput.value = '';
        passwordInput.value = '';

        // Show modal
        modal.style.display = 'flex';

        // Focus username input
        setTimeout(() => usernameInput.focus(), 100);

        // Handle submit
        const handleSubmit = () => {
            const username = usernameInput.value.trim();
            const password = passwordInput.value;

            if (!username) {
                alert('Username is required');
                usernameInput.focus();
                return;
            }

            if (!password) {
                alert('Password is required');
                passwordInput.focus();
                return;
            }

            // Hide modal
            modal.style.display = 'none';

            // Clean up event listeners
            submitBtn.removeEventListener('click', handleSubmit);
            cancelBtn.removeEventListener('click', handleCancel);
            usernameInput.removeEventListener('keypress', handleKeyPress);
            passwordInput.removeEventListener('keypress', handleKeyPress);

            resolve({ username, password });
        };

        // Handle cancel
        const handleCancel = () => {
            // Hide modal
            modal.style.display = 'none';

            // Clean up event listeners
            submitBtn.removeEventListener('click', handleSubmit);
            cancelBtn.removeEventListener('click', handleCancel);
            usernameInput.removeEventListener('keypress', handleKeyPress);
            passwordInput.removeEventListener('keypress', handleKeyPress);

            reject(new Error('User cancelled credential entry'));
        };

        // Handle Enter key
        const handleKeyPress = (event) => {
            if (event.key === 'Enter') {
                handleSubmit();
            }
        };

        // Add event listeners
        submitBtn.addEventListener('click', handleSubmit);
        cancelBtn.addEventListener('click', handleCancel);
        usernameInput.addEventListener('keypress', handleKeyPress);
        passwordInput.addEventListener('keypress', handleKeyPress);
    });
}

/**
 * Generate token for SLIP authentication via secure API endpoint
 * Falls back to client-side credential prompt if API is not configured
 */
async function generateSLIPToken() {
    console.log('Generating SLIP token via API endpoint...');

    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    try {
        const response = await fetch(SLIP_SERVICES.API_TOKEN_ENDPOINT, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Token API error:', response.status, errorData);

            // Check if it's a configuration error - fall back to manual credential entry
            if (response.status === 404 ||
                (response.status === 500 && errorData.error && errorData.error.includes('configuration'))) {
                console.warn('⚠️ API not configured - falling back to manual credential entry');

                if (response.status === 404) {
                    console.warn('API endpoint not available (local development)');
                }
                else {
                    console.warn('API not configured - falling back to manual credential entry');
                }
                // Show credential modal directly
                const { username, password } = await promptForCredentials();
                return await generateSLIPTokenFromCredentials(username, password);
            }

            throw new Error(`Token generation failed: ${errorData.error || response.statusText}`);
        }

        const data = await response.json();

        // Check if it's a static token (expires: null) or dynamic token (expires: timestamp)
        if (data.expires === null) {
            console.log('✅ Using static SLIP token from server');
        } else {
            console.log('✅ Generated dynamic SLIP token from server (expires in 60 minutes)');
        }

        if (data.token) {
            return data.token;
        } else {
            console.error('No token in API response:', data);
            throw new Error('Token generation failed: No token in response');
        }
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.error('Token generation timeout after 15 seconds');
            throw new Error('Token generation timeout - API not responding');
        }
        console.error('Token generation error:', error);
        throw error;
    }
}

/**
 * Create all map layers
 */
export async function createLayers(modules) {
    const { esriConfig, GraphicsLayer, GeoJSONLayer, FeatureLayer, TileLayer, Basemap, Graphic, geometryEngine, Point } = modules;

    // Configure request interceptor for SLIP authentication
    let tokenGenerated = false;
    let slipToken = null;

    console.log('⏳ Waiting for SLIP token generation...');

    try {
        slipToken = await generateSLIPToken();
        console.log('✅ Token generated successfully, configuring request interceptor...');

        esriConfig.request.interceptors.push({
            urls: SLIP_SERVICES.SERVER_ROOT,
            before: function (params) {
                params.requestOptions.query = params.requestOptions.query || {};
                params.requestOptions.query.token = slipToken;
            }
        });

        tokenGenerated = true;
        console.log('✅ Request interceptor configured - SLIP layers can now load');
    } catch (error) {
        console.error('❌ Failed to generate SLIP token:', error);

        // Only show alert if it's not a user cancellation
        if (!error.message.includes('declined') && !error.message.includes('cancelled')) {
            alert('Failed to authenticate with SLIP services: ' + error.message + '\n\nThe map will load without the SLIP cadastre layers.');
        } else {
            console.log('⚠️ User chose to skip SLIP authentication - map will load without SLIP layers');
        }
    }

    // Create graphics layer for markers
    const graphicsLayer = new GraphicsLayer({
        id: "markersLayer",
        title: "User Markers & Highlights"
    });

    // Create graphics layer for setback zones
    const setbackLayer = new GraphicsLayer({
        id: "setbackLayer",
        title: "10m Frontage Setback Zone",
        visible: true
    });

    // Create graphics layer for subdivision lines
    const subdivisionLayer = new GraphicsLayer({
        id: "subdivisionLayer",
        title: "Property Subdivisions",
        visible: true
    });

    // Create graphics layer for electrical connection points (user-generated nodes)
    const electricalLayer = new GraphicsLayer({
        id: "electricalLayer",
        title: "Electrical Connection Points",
        visible: true
    });

    // Property addresses layer - disabled (no SLIP service available)
    const propertyLayer = null;

    // SLIP-authenticated layers - only create if token was successfully generated
    let cadastreLayer = null;
    let cadastreLinesLayer = null;
    let lodgedCadastreLayer = null;
    let lodgedCadastralLinesLayer = null;

    if (tokenGenerated) {
        console.log('🔨 Creating SLIP-authenticated layers (token ready)...');

        // Create cadastral boundaries layer - Cadastral_FS Layer 8
        // Layer 8 (Cadastre Polygon) matches the Cadastral_FS service used for lines (Layer 7)
        // This ensures compatibility and uses the same service family for both polygons and lines
        cadastreLayer = new FeatureLayer({
            url: `${SLIP_SERVICES.CADASTRE_FEATURESERVER}/8`,
            title: "Cadastral Boundaries (Cadastral_FS Polygon)",
            outFields: ["*"],
            renderer: {
                type: "simple",
                symbol: {
                    type: "simple-fill",
                    color: [...LAYER_COLORS.CADASTRE_FILL, 0.1],
                    outline: {
                        color: [...LAYER_COLORS.CADASTRE_OUTLINE_RED, 0.6],
                        width: LAYER_STYLES.CADASTRE_OUTLINE_WIDTH
                    }
                }
            },
            popupEnabled: false,
            opacity: 0.8
        });

        // Create cadastral lines layer - Cadastral_FS Layer 7
        // Layer 7 has the render_normal field needed for frontage detection (1-Y/1-N = frontage, 2-Y/2-N = interior)
        cadastreLinesLayer = new FeatureLayer({
            url: `${SLIP_SERVICES.CADASTRE_FEATURESERVER}/7`,
            title: "Road / Boundary Lines (Cadastral_FS)",
            outFields: ["*"],
            renderer: {
                type: "unique-value",
                field: "render_normal",  // Use render_normal field (string values like "1-Y", "1-N", "2-Y", "2-N")
                uniqueValueInfos: [
                    {
                        value: "1-Y",  // Road Boundary - Surveyed (frontage)
                        symbol: {
                            type: "simple-line",
                            color: [...LAYER_COLORS.FRONTAGE_GREEN, 0.9],
                            width: LAYER_STYLES.FRONTAGE_LINE_WIDTH
                        },
                        label: "Road Boundary - Surveyed"
                    },
                    {
                        value: "1-N",  // Road Boundary - Unsurveyed (frontage)
                        symbol: {
                            type: "simple-line",
                            color: [...LAYER_COLORS.FRONTAGE_GREEN, 0.9],
                            width: LAYER_STYLES.FRONTAGE_LINE_WIDTH,
                            style: "dash"  // Dashed for unsurveyed
                        },
                        label: "Road Boundary - Unsurveyed"
                    },
                    {
                        value: "2-Y",  // Internal Boundary - Surveyed
                        symbol: {
                            type: "simple-line",
                            color: [...LAYER_COLORS.INTERIOR_GRAY, 0.4],
                            width: LAYER_STYLES.INTERIOR_LINE_WIDTH
                        },
                        label: "Internal Boundary - Surveyed"
                    },
                    {
                        value: "2-N",  // Internal Boundary - Unsurveyed
                        symbol: {
                            type: "simple-line",
                            color: [...LAYER_COLORS.INTERIOR_GRAY, 0.4],
                            width: LAYER_STYLES.INTERIOR_LINE_WIDTH,
                            style: "dash"  // Dashed for unsurveyed
                        },
                        label: "Internal Boundary - Unsurveyed"
                    }
                ],
                defaultSymbol: {
                    type: "simple-line",
                    color: [...LAYER_COLORS.DEFAULT_GRAY, 0.3],
                    width: LAYER_STYLES.DEFAULT_LINE_WIDTH
                },
                defaultLabel: "Other Boundary"
            },
            popupEnabled: false,
            opacity: 1.0,
            visible: false  // Start hidden
        });
        // Lodged Cadastre Polygon Layer (Layer 2) - Blue with horizontal hatch pattern
        lodgedCadastreLayer = new FeatureLayer({
            url: `${SLIP_SERVICES.TENURE_POLYGON_FS}/2`,
            title: "Lodged Cadastral Boundaries (Polygons - Lodged)",
            outFields: ["*"],
            renderer: {
                type: "simple",
                symbol: {
                    type: "simple-fill",
                    color: [0, 0, 255, 0.15],  // Blue with transparency
                    style: "horizontal",  // Horizontal hatch pattern
                    outline: {
                        color: [0, 0, 255, 0.8],  // Blue outline
                        width: 2
                    }
                }
            },
            popupEnabled: false,
            opacity: 0.8,
            visible: false  // Start hidden
        });

        // Lodged Cadastral Lines Layer (Layer 3) - Blue-teal for proposed boundaries
        lodgedCadastralLinesLayer = new FeatureLayer({
            url: `${SLIP_SERVICES.TENURE_POLYGON_FS}/3`,
            title: "Lodged Cadastral Lines (Lines - Lodged)",
            outFields: ["*"],
            renderer: {
                type: "simple",
                symbol: {
                    type: "simple-line",
                    color: [0, 124, 158, 0.9],  // Blue-teal color
                    width: 2,
                    style: "dash"  // Dashed to indicate proposed/pending status
                }
            },
            popupEnabled: false,
            opacity: 1.0,
            visible: false  // Start hidden
        });
    }

    // Western Power Utility Infrastructure Layers
    // These are NOT created here - they are lazy-loaded when user toggles them on
    // This prevents unnecessary data fetching when Data Source is "None"

    // Create street basemap
    const streetBasemap = new Basemap({
        baseLayers: [
            new TileLayer({
                url: BASEMAP_URLS.STREET
            })
        ],
        title: "Streets",
        id: "streets"
    });

    // Create satellite basemap
    const satelliteBasemap = new Basemap({
        baseLayers: [
            new TileLayer({
                url: BASEMAP_URLS.SATELLITE
            })
        ],
        title: "Satellite",
        id: "satellite"
    });

    return {
        graphicsLayer,
        setbackLayer,
        subdivisionLayer,
        electricalLayer,
        cadastreLayer,  // Cadastral_FS Layer 8 - Cadastre Polygon (matches lines layer service)
        propertyLayer,
        cadastreLinesLayer,  // Cadastral_FS Layer 7 - Lines with frontage classification
        lodgedCadastreLayer,  // Tenure_By_Polygon_FS Layer 2 - Polygons - Lodged
        lodgedCadastralLinesLayer,  // Tenure_By_Polygon_FS Layer 3 - Lines - Lodged
        streetBasemap,
        satelliteBasemap,
        slipToken,  // Include token for lazy-loading Western Power layers
        tokenGenerated,  // Flag to indicate if SLIP token was successfully generated
        modules: { GraphicsLayer, GeoJSONLayer, FeatureLayer, TileLayer, Basemap, Graphic, geometryEngine, Point }  // Include all modules for lazy-loading and subdivision
    };
}

/**
 * Initialize the map with layers
 * Western Power utility layers are NOT added here - they are lazy-loaded when user toggles them on
 */
export function initializeMap(Map, layers) {
    const { cadastreLayer, cadastreLinesLayer, propertyLayer, setbackLayer, subdivisionLayer, electricalLayer, graphicsLayer, lodgedCadastreLayer, lodgedCadastralLinesLayer, streetBasemap } = layers;

    const map = new Map({
        basemap: streetBasemap,
        layers: [
            cadastreLayer,
            cadastreLinesLayer,
            lodgedCadastreLayer,
            lodgedCadastralLinesLayer,
            propertyLayer,
            setbackLayer,
            subdivisionLayer,
            graphicsLayer,
            electricalLayer
        ].filter(layer => layer !== null)  // Filter out null layers (when token fails)
    });

    return map;
}

/**
 * Create a Western Power layer on-demand (lazy loading)
 * @param {string} layerKey - The key in appState.layers (e.g., 'pillars', 'utilityPoles')
 * @returns {FeatureLayer} The created layer
 */
export function createWesternPowerLayer(layerKey) {
    const config = WESTERN_POWER_LAYERS[layerKey];

    if (!config) {
        console.error(`Unknown Western Power layer: ${layerKey}`);
        return null;
    }

    if (!appState.slipToken) {
        console.error('SLIP token not available - cannot create Western Power layer');
        return null;
    }

    if (!appState.arcgisModules) {
        console.error('ArcGIS modules not available - cannot create Western Power layer');
        return null;
    }

    const { FeatureLayer } = appState.arcgisModules;

    console.log(`Creating Western Power layer: ${config.name} (Layer ${config.id})`);

    // Determine geometry type and create appropriate renderer
    let renderer;

    // Point layers (0-5, 13)
    if ([0, 1, 2, 3, 4, 5, 13].includes(config.id)) {
        let markerStyle = 'circle';
        let markerSize = '8px';

        // Customize marker styles
        if (config.id === 4) { markerStyle = 'diamond'; markerSize = '6px'; }  // Pillars
        else if (config.id === 5) { markerStyle = 'square'; markerSize = '10px'; }  // Transformers
        else if (config.id === 0) { markerStyle = 'circle'; markerSize = '4px'; }  // Streetlights (small)

        renderer = {
            type: "simple",
            symbol: {
                type: "simple-marker",
                style: markerStyle,
                size: markerSize,
                color: config.color,
                outline: {
                    color: [255, 255, 255],
                    width: 0.5
                }
            }
        };
    }
    // Line layers (6-12)
    else if ([6, 7, 8, 9, 10, 11].includes(config.id)) {
        const isUnderground = [7, 8, 9].includes(config.id);
        renderer = {
            type: "simple",
            symbol: {
                type: "simple-line",
                color: config.color,
                width: 2,
                style: isUnderground ? "dash" : "solid"
            }
        };
    }
    // Polygon layers (12, 14, 15, 16, 17)
    else {
        renderer = {
            type: "simple",
            symbol: {
                type: "simple-fill",
                color: config.color,
                outline: {
                    color: [255, 255, 255, 0.8],
                    width: 1
                }
            }
        };
    }

    const layer = new FeatureLayer({
        url: `${SLIP_SERVICES.WP_UTILITIES}/${config.id}`,
        title: `${config.name} (${config.code})`,
        outFields: ["*"],
        renderer: renderer,
        popupTemplate: {
            title: config.name,
            content: function (feature) {
                return generateAttributesPopup(feature.graphic.attributes);
            }
        },
        visible: true  // Start visible when created (user explicitly toggled it on)
    });

    console.log(`✅ Western Power layer created: ${config.name}`);
    return layer;
}

/**
 * Initialize the map view
 */
export function initializeMapView(MapView, map) {
    const mapView = new MapView({
        container: "arcgisMap",
        map: map,
        center: MAP_CONFIG.PERTH_CENTER,  // Perth, WA
        zoom: MAP_CONFIG.DEFAULT_ZOOM,
        constraints: {
            minZoom: MAP_CONFIG.MIN_ZOOM,
            maxZoom: MAP_CONFIG.MAX_ZOOM
        }
    });

    return mapView;
}

/**
 * Add map widgets (BasemapToggle, Locate)
 */
export function addMapWidgets(mapView, modules, layers, addMarkerCallback, reverseGeocodeCallback) {
    const { BasemapToggle, Locate, Point, Graphic } = modules;

    // Add BasemapToggle widget (bottom right)
    const basemapToggle = new BasemapToggle({
        view: mapView,
        nextBasemap: layers.satelliteBasemap
    });
    mapView.ui.add(basemapToggle, "bottom-right");

    // Add Locate widget (GPS location button)
    const locateWidget = new Locate({
        view: mapView,
        useHeadingEnabled: false,
        goToOverride: function (view, options) {
            options.target.scale = MAP_CONFIG.LOCATE_SCALE;
            return view.goTo(options.target);
        }
    });
    mapView.ui.add(locateWidget, "top-left");

    // Listen for location found event
    locateWidget.on("locate", function (event) {
        const point = new Point({
            latitude: event.position.coords.latitude,
            longitude: event.position.coords.longitude
        });

        // Check if location is in Western Australia
        if (isInWesternAustralia(point.longitude, point.latitude)) {
            addMarkerCallback(point, Point, Graphic);
            reverseGeocodeCallback(point.latitude, point.longitude);
        } else {
            alert('Your current location is not in Western Australia. Please search for an address in WA.');
        }
    });
}

/**
 * Setup layer loading handlers and diagnostics
 */
export function setupLayerLoadingHandlers(layers) {
    const { cadastreLayer, propertyLayer, cadastreLinesLayer } = layers;

    // Log cadastre layer loading (only if token was successfully generated)
    if (cadastreLayer) {
        cadastreLayer.when(function () {
            console.log('✅ Cadastre layer loaded successfully');
            // Note: MapImageLayer doesn't support queryFeatureCount (server-rendered layer)
        }, function (error) {
            console.error('❌ Error loading cadastre layer:', error);
        });
    } else {
        console.log('⚠️ Cadastre layer not available (SLIP token generation may have failed)');
    }

    // Log property layer loading (disabled - no SLIP service available)
    if (propertyLayer) {
        propertyLayer.when(function () {
            console.log('Property layer loaded successfully');

            // Query to get feature count
            propertyLayer.queryFeatureCount().then(function (count) {
                console.log('Property features count:', count);
            });
        }, function (error) {
            console.error('Error loading property layer:', error);
        });
    }

    // Log cadastral lines layer loading (only if token was successfully generated)
    if (cadastreLinesLayer) {
        cadastreLinesLayer.when(function () {
            console.log('✅ Cadastral lines layer loaded successfully');
            console.log('   Layer type:', cadastreLinesLayer.type);
            console.log('   Layer visible:', cadastreLinesLayer.visible);
            console.log('   Layer opacity:', cadastreLinesLayer.opacity);
            console.log('   Layer URL:', cadastreLinesLayer.url);

            // Note: MapImageLayer doesn't support queryFeatureCount (server-rendered layer)
            // Only query if it's a GeoJSONLayer
            if (cadastreLinesLayer.type === "geojson") {
                cadastreLinesLayer.queryFeatureCount().then(function (count) {
                    console.log('Total cadastral line features:', count);
                });

                // Query to count frontage lines specifically
                const frontageQuery = cadastreLinesLayer.createQuery();
                frontageQuery.where = "usage_code = 1";
                cadastreLinesLayer.queryFeatureCount(frontageQuery).then(function (count) {
                    console.log('Frontage lines (usage_code=1):', count);
                });
            } else {
                console.log('   Cadastral lines layer is MapImageLayer (server-rendered)');

                // Log sublayer details
                if (cadastreLinesLayer.sublayers) {
                    console.log('   Sublayers configured:');
                    cadastreLinesLayer.sublayers.forEach(function (sublayer) {
                        console.log(`      - ID ${sublayer.id}: ${sublayer.title}, visible=${sublayer.visible}`);

                        // Log nested sublayers if they exist
                        if (sublayer.sublayers) {
                            sublayer.sublayers.forEach(function (nestedSublayer) {
                                console.log(`         - ID ${nestedSublayer.id}: ${nestedSublayer.title}, visible=${nestedSublayer.visible}`);
                            });
                        }
                    });
                }
            }
        }, function (error) {
            console.error('❌ Error loading cadastral lines layer:', error);
        });
    } else {
        console.log('⚠️ Cadastral lines layer not available (SLIP token generation may have failed)');
    }
}

/**
 * Check if electrical node was clicked
 */
function isElectricalNodeClick(results, electricalLayer) {
    for (let result of results) {
        if (result.graphic && result.graphic.layer === electricalLayer) {
            console.log('Electrical node clicked - showing popup only, not changing location marker');
            return true;
        }
    }
    return false;
}

/**
 * Check if cadastral line was clicked
 */
function isCadastralLineClick(results, cadastreLinesLayer) {
    for (let result of results) {
        if (result.graphic && result.graphic.layer === cadastreLinesLayer) {
            console.log('Cadastral line clicked - showing popup only');
            return true;
        }
    }
    return false;
}

/**
 * Find clicked cadastral polygon
 */
function findClickedCadastralPolygon(results, cadastreLayer) {
    // Check for FeatureLayer or GeoJSONLayer
    for (let result of results) {
        if (result.graphic && result.graphic.layer === cadastreLayer) {
            console.log('✅ Cadastral polygon found in hit test');
            return result.graphic;
        }
    }

    return null;
}

/**
 * Handle polygon click
 */
function handlePolygonClick(polygonGraphic, clickPoint, highlightFrontageCallback) {
    console.log('🔍 handlePolygonClick called');
    console.log('Polygon attributes:', polygonGraphic.attributes);

    // Check if this is a road polygon - roads cannot be selected
    const landType = polygonGraphic.attributes?.land_type;
    console.log('Land type attribute:', landType);

    if (landType === 'ROAD') {
        console.log('🚫 Skipping ROAD land type - roads cannot be selected');

        // Show brief message to user
        const addressStatus = document.getElementById('addressStatus');
        if (addressStatus) {
            const originalText = addressStatus.textContent;
            addressStatus.textContent = 'Cannot select roads - please select a property';
            addressStatus.style.color = '#F26D21';

            // Reset after 3 seconds
            setTimeout(() => {
                addressStatus.textContent = originalText;
                addressStatus.style.color = '#666';
            }, 3000);
        }

        return; // Early return - don't highlight
    }

    // Valid property - highlight it
    console.log('✅ Polygon is valid for selection - calling highlightFrontageCallback');
    highlightFrontageCallback(polygonGraphic, clickPoint);
}

/**
 * Handle default click (no special element clicked)
 */
function handleDefaultClick(clickPoint, Point, Graphic, addMarkerCallback, reverseGeocodeCallback, hidePolygonMetadataCallback, setbackLayer) {
    addMarkerCallback(clickPoint, Point, Graphic);
    reverseGeocodeCallback(clickPoint.latitude, clickPoint.longitude);
    hidePolygonMetadataCallback();
    setbackLayer.removeAll();
    clearAllElectricalNodeGraphics();
    removeAllPotentialNodes();
}

/**
 * Setup map click handler
 */
export function setupMapClickHandler(mapView, layers, modules, highlightFrontageCallback, addMarkerCallback, reverseGeocodeCallback, hidePolygonMetadataCallback, handleSubdivisionClickCallback, isSubdivisionActiveCallback, checkSubPolygonClickCallback) {
    const { cadastreLayer, cadastreLinesLayer, setbackLayer, electricalLayer } = layers;
    const { Point, Graphic, geometryEngine } = modules;

    mapView.on("click", function (event) {
        // Check if subdivision mode is active
        if (isSubdivisionActiveCallback && isSubdivisionActiveCallback()) {
            const handled = handleSubdivisionClickCallback(event.mapPoint, { Graphic, geometryEngine });
            if (handled) return; // Early return - subdivision mode consumed the click
        }

        // Normal map click handling
        mapView.hitTest(event).then(function (response) {

            // Check if we clicked on a sub-polygon
            if (checkSubPolygonClickCallback) {
                const subPolygonHandled = checkSubPolygonClickCallback(response, event.mapPoint);
                if (subPolygonHandled) return; // Early return - sub-polygon click was handled
            }

            // Check if an electrical node was clicked (from hit test)
            if (response.results.length > 0 && isElectricalNodeClick(response.results, electricalLayer)) {
                return; // Early return - just show popup
            }

            // Check if a cadastral line was clicked (from hit test) - only if layer exists
            if (response.results.length > 0 && cadastreLinesLayer) {
                const lineClicked = isCadastralLineClick(response.results, cadastreLinesLayer);
                if (lineClicked) {
                    return; // Early return - just show popup
                }
            }

            // Check for clicked cadastral polygon (works for FeatureLayer/GeoJSONLayer) - only if layer exists
            // With Tenure_By_Polygon_FS FeatureLayer, hitTest returns results directly - no server query needed
            if (cadastreLayer) {
                const clickedPolygon = findClickedCadastralPolygon(response.results, cadastreLayer);

                if (clickedPolygon) {
                    handlePolygonClick(clickedPolygon, event.mapPoint, highlightFrontageCallback);
                    return; // Early return - polygon was handled
                }
            }

            // Default click handling (no cadastral polygon found or layer not available)
            handleDefaultClick(event.mapPoint, Point, Graphic, addMarkerCallback, reverseGeocodeCallback, hidePolygonMetadataCallback, setbackLayer);
        });
    });
}
