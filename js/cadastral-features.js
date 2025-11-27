// Cadastral Features
// Polygon highlighting, frontage detection, and setback zone generation

import { appState } from './config.js';
import {
    updateCoordinatesDisplay,
    updatePolygonMetadata
} from './utils.js';
import { generateOrFindConnectionNode, updateNodeVisualizationForProperty, removeAllPotentialNodes, clearAllElectricalNodeGraphics, drawConnectionLines, clearConnectionLines } from './electrical-infrastructure.js';

// Constants - Colors
const COLORS = {
    ORANGE: [242, 109, 33],
    ORANGE_SETBACK: [255, 140, 0],
    GOLD: [255, 215, 0],
    WHITE: [255, 255, 255]
};

// Constants - Measurements
const POLYGON_BUFFER_DISTANCE = 2;  // meters - tolerance for dataset misalignment
const ENDPOINT_DISTANCE_THRESHOLD = 1.5;  // meters - max distance from polygon boundary
const SETBACK_ZONE_DISTANCE = 10;  // meters - setback from frontage
const PIN_SEARCH_ZOOM_LEVEL = 17;

// Constants - UI Sizes
const MARKER_SIZE_LARGE = "18px";
const MARKER_SIZE_DEFAULT = "16px";
const OUTLINE_WIDTH_THICK = 2.5;
const OUTLINE_WIDTH_DEFAULT = 2;
const OUTLINE_WIDTH_THIN = 1.5;
const FRONTAGE_LINE_WIDTH = 3;

// Constants - Symbols
const POLYGON_HIGHLIGHT_SYMBOL = {
    type: "simple-fill",
    color: [...COLORS.ORANGE, 0.1],  // Light orange fill with low transparency
    outline: {
        color: [...COLORS.ORANGE, 0.8],  // Orange outline
        width: OUTLINE_WIDTH_THICK
    }
};

const MARKER_SYMBOL_LARGE = {
    type: "simple-marker",
    color: COLORS.ORANGE,
    size: MARKER_SIZE_LARGE,
    outline: {
        color: COLORS.WHITE,
        width: OUTLINE_WIDTH_THICK
    }
};

const MARKER_SYMBOL_DEFAULT = {
    type: "simple-marker",
    color: COLORS.ORANGE,
    size: MARKER_SIZE_DEFAULT,
    outline: {
        color: COLORS.WHITE,
        width: OUTLINE_WIDTH_DEFAULT
    }
};

/**
 * Check if clicked on a sub-polygon and handle it
 */
export function checkAndHandleSubPolygonClick(hitTestResult, clickPoint, modules, reverseGeocodeCallback) {
    if (!appState.subPolygonData) {
        console.log('No sub-polygon data available');
        return false;
    }

    if (!hitTestResult || !hitTestResult.results) {
        return false;
    }

    console.log(`🔍 Checking ${hitTestResult.results.length} hit test results for sub-polygons`);

    // Check if any of the hit results is a sub-polygon
    for (const result of hitTestResult.results) {
        if (result.graphic && result.graphic.attributes && result.graphic.attributes.subPolygon) {
            const subIndex = result.graphic.attributes.subIndex;
            const subData = appState.subPolygonData[subIndex];

            console.log(`✅ Sub-polygon ${subIndex + 1} clicked!`);
            console.log(`   - Frontage lines: ${subData ? subData.frontageLines.length : 'undefined'}`);

            if (subData) {
                // Create a temporary polygon graphic from the sub-polygon data
                const subPolygonGraphic = {
                    geometry: result.graphic.geometry,
                    attributes: {
                        __OBJECTID: `SUB_${subIndex}`,
                        subPolygon: true,
                        subIndex: subIndex,
                        originalPolygonId: subData.originalPolygonId || 'Unknown'
                    }
                };

                // Highlight frontage using the sub-polygon's frontage lines
                highlightSubPolygonFrontage(subPolygonGraphic, clickPoint, subData.frontageLines, modules, reverseGeocodeCallback);
                return true;
            } else {
                console.warn(`⚠️ Sub-polygon data missing for index ${subIndex}`);
            }
        }
    }

    return false;
}

/**
 * Highlight sub-polygon frontage
 */
function highlightSubPolygonFrontage(subPolygonGraphic, clickPoint, frontageLines, modules, reverseGeocodeCallback) {
    const { Graphic, geometryEngine, Point } = modules;
    const { layers } = appState;

    console.log('=== SUB-POLYGON FRONTAGE HIGHLIGHT ===');
    console.log(`Sub-polygon index: ${subPolygonGraphic.attributes.subIndex + 1}`);
    console.log(`Frontage lines received: ${frontageLines ? frontageLines.length : 'null/undefined'}`);

    // Clear ALL electrical node graphics from map (will be re-rendered with correct styling)
    clearAllElectricalNodeGraphics();

    // Remove all potential electrical nodes from memory (switching to a different polygon)
    removeAllPotentialNodes();

    // Clear connection lines from previous property/sub-polygon
    clearConnectionLines();

    // Store current polygon in app state
    appState.currentPolygon = subPolygonGraphic;

    // Clear existing highlights (but NOT subdivision graphics)
    layers.graphics.removeAll();

    // Highlight the selected sub-polygon itself
    const polygonHighlight = new Graphic({
        geometry: subPolygonGraphic.geometry,
        symbol: POLYGON_HIGHLIGHT_SYMBOL
    });

    layers.graphics.add(polygonHighlight);
    console.log('✅ Sub-polygon highlighted with orange outline');

    // Add marker at click point
    const markerGraphic = new Graphic({
        geometry: clickPoint,
        symbol: MARKER_SYMBOL_LARGE
    });

    layers.graphics.add(markerGraphic);
    appState.currentMarker = markerGraphic;

    // Update location
    appState.currentLocation.lat = clickPoint.latitude;
    appState.currentLocation.lng = clickPoint.longitude;
    updateCoordinatesDisplay(clickPoint.latitude, clickPoint.longitude);
    reverseGeocodeCallback(clickPoint.latitude, clickPoint.longitude);

    // Update polygon metadata display (always show, even if no frontage)
    const boundaryEdgeCount = subPolygonGraphic.geometry.rings[0].length - 1;
    const pseudoValidLines = new Array(boundaryEdgeCount).fill(null);
    updatePolygonMetadata(subPolygonGraphic, pseudoValidLines, frontageLines || []);

    // Highlight frontage lines if they exist
    if (frontageLines && frontageLines.length > 0) {
        console.log(`🎨 Rendering ${frontageLines.length} frontage line(s)...`);

        frontageLines.forEach(function(line, index) {
            const usageCode = line.attributes?.usage_code;
            const renderNormal = line.attributes?.render_normal;

            console.log(`  📍 Frontage line ${index + 1}:`, {
                hasGeometry: !!line.geometry,
                geometryType: line.geometry?.type,
                hasAttributes: !!line.attributes,
                usage_code: usageCode,
                render_normal: renderNormal
            });

            // Verify this is a frontage line
            const isFrontage = usageCode === 1 || usageCode === '1-Y' || usageCode === '1-N' || renderNormal === '1-Y' || renderNormal === '1-N';
            if (!isFrontage) {
                console.warn(`  ⚠️ WARNING: Frontage line ${index + 1} has unexpected field values (expected usage_code=1/'1-Y'/'1-N' or render_normal='1-Y'/'1-N')`);
            }

            const highlightSymbol = {
                type: "simple-line",
                color: [...COLORS.GOLD, 0.95],  // Bright yellow/gold
                width: FRONTAGE_LINE_WIDTH,
                style: "solid",
                cap: "round",
                join: "round"
            };

            const highlightGraphic = new Graphic({
                geometry: line.geometry,
                symbol: highlightSymbol,
                attributes: line.attributes
            });

            layers.graphics.add(highlightGraphic);
            const fieldInfo = usageCode !== undefined ? `usage_code=${usageCode}` : `render_normal=${renderNormal}`;
            console.log(`  ✅ Highlighted sub-polygon frontage line ${index + 1} (${fieldInfo})`);
        });

        // Store frontage lines
        appState.currentFrontageLines = frontageLines;

        // Generate setback zone (drawn to setback layer)
        generateSetbackZone(frontageLines, subPolygonGraphic, Graphic, geometryEngine);

        // Generate electrical node (async - may query pillars layer)
        generateOrFindConnectionNode(
            subPolygonGraphic,
            frontageLines,
            { Graphic, geometryEngine, Point }
        ).then(function(electricalNode) {
            if (electricalNode) {
                console.log(`Electrical node ${electricalNode.id} assigned to sub-polygon`);
            }

            // Update node visualization (pass primary node ID for cable highlighting)
            updateNodeVisualizationForProperty(
                frontageLines,
                subPolygonGraphic.geometry,
                { Graphic, geometryEngine, Point },
                electricalNode ? electricalNode.id : null  // Pass primary node ID
            );
        }).catch(function(error) {
            console.error('Error finding electrical node:', error);
        });
    } else {
        console.log('Sub-polygon has no frontage lines');
        appState.currentFrontageLines = [];
    }
}

/**
 * Query cadastral lines via REST API identify (for MapImageLayer)
 */
function queryCadastralLinesViaIdentify(bufferedPolygon, polygonGraphic, Graphic, layers) {
    console.log('🔍 Querying cadastral lines via MapImageLayer identify API...');

    const extent = bufferedPolygon.extent;
    const identifyParams = {
        geometry: JSON.stringify({
            rings: bufferedPolygon.rings,
            spatialReference: bufferedPolygon.spatialReference
        }),
        geometryType: 'esriGeometryPolygon',
        sr: polygonGraphic.geometry.spatialReference.wkid,
        layers: 'visible:24,25,26,27,28,30,31,32,33,34',  // Query all cadastral lines sublayers (Large Scale + Small Scale)
        tolerance: 0,
        mapExtent: JSON.stringify(extent.toJSON()),
        imageDisplay: `${appState.mapView.width},${appState.mapView.height},96`,
        returnGeometry: true,
        token: layers.slipToken,
        f: 'json'
    };

    const queryParams = new URLSearchParams(identifyParams);
    const identifyUrl = `${layers.cadastreLines.url}/identify`;

    return fetch(identifyUrl, {
        method: 'POST',
        body: queryParams,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    })
        .then(resp => resp.json())
        .then(data => {
            if (data.results && data.results.length > 0) {
                console.log(`✅ Found ${data.results.length} line features via identify`);

                // Convert identify results to feature format
                const features = data.results.map(result => {
                    return new Graphic({
                        geometry: {
                            type: "polyline",
                            paths: result.geometry.paths,
                            spatialReference: result.geometry.spatialReference
                        },
                        attributes: result.attributes
                    });
                });

                return { features: features };
            } else {
                console.log('No line features found via identify');
                return { features: [] };
            }
        })
        .catch(error => {
            console.error('❌ Identify query for lines failed:', error);
            return { features: [] };
        });
}

/**
 * Query cadastral lines via FeatureLayer query (for GeoJSONLayer)
 */
function queryCadastralLinesViaFeatureLayer(bufferedPolygon, polygonGraphic, layers) {
    console.log('🔍 Querying cadastral lines via FeatureLayer query...');

    const query = layers.cadastreLines.createQuery();
    query.geometry = bufferedPolygon;
    query.spatialRelationship = "intersects";
    query.outFields = ["*"];
    query.returnGeometry = true;
    query.outSpatialReference = polygonGraphic.geometry.spatialReference;

    return layers.cadastreLines.queryFeatures(query);
}

/**
 * Highlight cadastral frontage when polygon is clicked
 */
export function highlightCadastralFrontage(polygonGraphic, clickPoint, modules, reverseGeocodeCallback) {
    const { Graphic, geometryEngine, Point } = modules;
    const { layers } = appState;

    console.log('Cadastral polygon clicked');
    console.log('Polygon attributes:', polygonGraphic.attributes);

    // Get the polygon ID for connection line drawing
    const polygonId = polygonGraphic.attributes.objectid || polygonGraphic.attributes.__OBJECTID || polygonGraphic.attributes.OBJECTID;

    // Clear ALL electrical node graphics from map (will be re-rendered with correct styling)
    clearAllElectricalNodeGraphics();

    // Remove all potential electrical nodes from memory (switching to a different polygon)
    removeAllPotentialNodes();

    // Clear all connection lines (will redraw for current property only)
    clearConnectionLines();

    // Store current polygon in app state
    appState.currentPolygon = polygonGraphic;

    // Clear existing highlights (frontage lines, polygon outline, marker)
    // but keep subdivision polygons visible
    layers.graphics.removeAll();

    // Highlight the selected polygon itself (added first - bottom layer)
    const polygonHighlight = new Graphic({
        geometry: polygonGraphic.geometry,
        symbol: POLYGON_HIGHLIGHT_SYMBOL
    });

    layers.graphics.add(polygonHighlight);
    console.log('Selected polygon highlighted');

    // Ensure layer is loaded before querying
    layers.cadastreLines.when(function() {
        // Diagnostic logging for polygon geometry
        console.log('=== POLYGON GEOMETRY DIAGNOSTICS ===');
        console.log('Polygon geometry:', polygonGraphic.geometry);
        if (polygonGraphic.geometry.rings) {
            console.log(`Polygon rings: ${polygonGraphic.geometry.rings.length}`);
            if (polygonGraphic.geometry.rings[0]) {
                console.log(`Polygon vertices: ${polygonGraphic.geometry.rings[0].length}`);
            } else {
                console.log('Polygon rings[0] is undefined - checking geometry structure');
            }
        } else {
            console.log('Polygon rings property is undefined - geometry may need conversion');
        }
        console.log(`Polygon spatial reference: ${polygonGraphic.geometry.spatialReference.wkid}`);
        console.log(`Layer type: ${layers.cadastreLines.type}`);
        console.log(`Layer loaded: ${layers.cadastreLines.loaded}`);
        console.log(`Click point: [${clickPoint.longitude}, ${clickPoint.latitude}]`);

        // DISTANCE-BASED MATCHING: Find lines near the polygon boundary
        // This handles misalignment between Cadastral Boundaries and Property Boundary Lines datasets
        console.log('=== DISTANCE-BASED LINE MATCHING ===');

        // Create a buffer zone around the polygon (2 meters tolerance for dataset misalignment)
        const bufferedPolygon = geometryEngine.buffer(polygonGraphic.geometry, POLYGON_BUFFER_DISTANCE, "meters");
        console.log(`Created ${POLYGON_BUFFER_DISTANCE}m buffer zone around polygon to account for dataset misalignment`);

        // Query strategy depends on layer type
        const queryPromise = (layers.cadastreLines.type === "map-image" && layers.slipToken) ?
            queryCadastralLinesViaIdentify(bufferedPolygon, polygonGraphic, Graphic, layers) :
            queryCadastralLinesViaFeatureLayer(bufferedPolygon, polygonGraphic, layers);

        queryPromise.then(function(result) {
            console.log(`Found ${result.features.length} lines within ${POLYGON_BUFFER_DISTANCE}m of polygon boundary`);
            console.log(`Polygon OBJECTID (authoritative source): ${polygonGraphic.attributes.objectid || polygonGraphic.attributes.__OBJECTID || polygonGraphic.attributes.OBJECTID}`);

            // Log first line's spatial reference
            if (result.features.length > 0) {
                console.log(`First line spatial reference: ${result.features[0].geometry.spatialReference.wkid}`);
            }

            // Filter by ENDPOINT distance: Both endpoints must be close to polygon boundary
            console.log('=== FILTERING BY ENDPOINT DISTANCE TO POLYGON BOUNDARY ===');
            const validLines = result.features.filter(function(lineFeature) {
                const path = lineFeature.geometry.paths[0];
                if (!path || path.length < 2) return false;

                const lineNo = lineFeature.attributes.line_no;

                // Handle both field types: usage_code (local/FeatureServer) and render_normal (MapServer)
                // usage_code can be: 1, 2 (local GeoJSON) or "1-Y", "1-N" (FeatureServer)
                // render_normal is: "1-Y", "1-N" (MapServer)
                const usageCode = lineFeature.attributes.usage_code;
                const renderNormal = lineFeature.attributes.render_normal;

                let usageLabel = 'OTHER';
                if (usageCode === 1 || usageCode === '1-Y' || usageCode === '1-N' || renderNormal === '1-Y' || renderNormal === '1-N') {
                    usageLabel = 'FRONTAGE';
                } else if (usageCode === 2) {
                    usageLabel = 'INTERIOR';
                }

                // Get line endpoints
                const startPoint = path[0];
                const endPoint = path[path.length - 1];

                // Create Point geometries for endpoints
                const startPointGeom = {
                    type: "point",
                    x: startPoint[0],
                    y: startPoint[1],
                    spatialReference: lineFeature.geometry.spatialReference
                };

                const endPointGeom = {
                    type: "point",
                    x: endPoint[0],
                    y: endPoint[1],
                    spatialReference: lineFeature.geometry.spatialReference
                };

                // Calculate distance from each endpoint to polygon boundary
                const startDistance = geometryEngine.distance(
                    startPointGeom,
                    polygonGraphic.geometry,
                    "meters"
                );

                const endDistance = geometryEngine.distance(
                    endPointGeom,
                    polygonGraphic.geometry,
                    "meters"
                );

                // BOTH endpoints must be close to the polygon boundary
                const bothEndpointsClose = (startDistance <= ENDPOINT_DISTANCE_THRESHOLD) && (endDistance <= ENDPOINT_DISTANCE_THRESHOLD);

                if (bothEndpointsClose) {
                    const fieldInfo = usageCode ? `usage_code=${usageCode}` : `render_normal=${renderNormal}`;
                    console.log(`  INCLUDED: line_no=${lineNo}, ${fieldInfo} (${usageLabel}), start=${startDistance.toFixed(2)}m, end=${endDistance.toFixed(2)}m`);
                    return true;
                } else {
                    const fieldInfo = usageCode ? `usage_code=${usageCode}` : `render_normal=${renderNormal}`;
                    console.log(`  EXCLUDED: line_no=${lineNo}, ${fieldInfo}, start=${startDistance.toFixed(2)}m, end=${endDistance.toFixed(2)}m (one or both endpoints too far)`);
                    return false;
                }
            });

            console.log(`After endpoint filtering: ${validLines.length} lines have both endpoints within ${ENDPOINT_DISTANCE_THRESHOLD}m of polygon boundary`);

            // Log ALL valid lines with field info
            validLines.forEach(function(feature, index) {
                const objectId = feature.attributes.objectid || feature.attributes.__OBJECTID || feature.attributes.OBJECTID || feature.attributes.FID || 'unknown';
                const lineNo = feature.attributes.line_no;
                const length = feature.attributes.distvalue;
                const usageCode = feature.attributes.usage_code;
                const renderNormal = feature.attributes.render_normal;

                let usageLabel = 'OTHER';
                if (usageCode === 1 || usageCode === '1-Y' || usageCode === '1-N' || renderNormal === '1-Y' || renderNormal === '1-N') {
                    usageLabel = 'FRONTAGE';
                } else if (usageCode === 2) {
                    usageLabel = 'INTERIOR';
                }

                const fieldInfo = usageCode !== undefined ? `usage_code=${usageCode}` : `render_normal=${renderNormal}`;
                console.log(`  Line ${index + 1}: __OBJECTID=${objectId}, line_no=${lineNo}, ${fieldInfo} (${usageLabel}), length=${length}m`);
            });

            if (validLines.length > 0) {
                // Filter for frontage lines only from VALID lines
                // Frontage = usage_code 1 (local), "1-Y"/"1-N" (FeatureServer) OR render_normal '1-Y'/'1-N' (MapServer)
                const frontageLines = validLines.filter(function(line) {
                    const usageCode = line.attributes.usage_code;
                    const renderNormal = line.attributes.render_normal;
                    return usageCode === 1 || usageCode === '1-Y' || usageCode === '1-N' || renderNormal === '1-Y' || renderNormal === '1-N';
                });

                console.log(`Found ${frontageLines.length} frontage lines to highlight`);

                // Highlight each frontage line in yellow (middle layer)
                frontageLines.forEach(function(line, index) {
                    const highlightSymbol = {
                        type: "simple-line",
                        color: [...COLORS.GOLD, 0.95],  // Gold color, slightly transparent
                        width: FRONTAGE_LINE_WIDTH,
                        style: "solid",
                        cap: "round",
                        join: "round"
                    };

                    const highlightGraphic = new Graphic({
                        geometry: line.geometry,
                        symbol: highlightSymbol,
                        attributes: line.attributes
                    });

                    layers.graphics.add(highlightGraphic);
                    console.log(`  Highlighted frontage line ${index + 1}: ${line.attributes.distvalue}m`);
                });

                // Create 10-meter setback zone inside polygon from frontage lines
                if (frontageLines.length > 0) {
                    generateSetbackZone(frontageLines, polygonGraphic, Graphic, geometryEngine);
                } else {
                    // No frontage lines, clear setback layer
                    layers.setback.removeAll();
                    console.log('No frontage lines - setback layer cleared');
                }

                // Fade unselected property boundaries by reducing cadastre layer opacity
                if (appState.layers.cadastre) {
                    appState.layers.cadastre.opacity = 0.4;  // 50% fade from default 0.8
                }

                // Add marker at click point (added last - top layer for maximum visibility)
                const markerGraphic = new Graphic({
                    geometry: clickPoint,
                    symbol: MARKER_SYMBOL_LARGE
                });

                layers.graphics.add(markerGraphic);
                appState.currentMarker = markerGraphic;

                // Update location
                appState.currentLocation.lat = clickPoint.latitude;
                appState.currentLocation.lng = clickPoint.longitude;
                updateCoordinatesDisplay(clickPoint.latitude, clickPoint.longitude);
                reverseGeocodeCallback(clickPoint.latitude, clickPoint.longitude);

                // Store frontage lines in app state for subdivision
                appState.currentFrontageLines = frontageLines;

                // Display polygon metadata
                updatePolygonMetadata(polygonGraphic, validLines, frontageLines);

                // Generate electrical nodes and update visualization (if frontage lines exist)
                if (frontageLines.length > 0) {
                    // Generate or find electrical connection node (async - may query pillars layer)
                    generateOrFindConnectionNode(
                        polygonGraphic,
                        frontageLines,
                        { Graphic, geometryEngine, Point }
                    ).then(function(electricalNode) {
                        if (electricalNode) {
                            console.log(`Electrical node ${electricalNode.id} assigned to property`);

                            // Draw connection line from node to current property only
                            drawConnectionLines(electricalNode, polygonId, { Graphic, geometryEngine, Point });
                        }

                        // Update node visualization to highlight nearby nodes and show distances
                        updateNodeVisualizationForProperty(
                            frontageLines,
                            polygonGraphic.geometry,
                            { Graphic, geometryEngine, Point },
                            electricalNode ? electricalNode.id : null  // Pass primary node ID
                        );
                    }).catch(function(error) {
                        console.error('Error finding electrical node:', error);
                    });
                } else {
                    console.log('No frontage lines found in this polygon');
                }
            } else {
                console.log('No cadastral lines found in this polygon');
            }
        }).catch(function(error) {
            console.error('Error querying cadastral lines:', error);
        });
    });  // Close .when() callback
}

/**
 * Generate 10-meter setback zone from frontage lines
 */
function generateSetbackZone(frontageLines, polygonGraphic, Graphic, geometryEngine) {
    console.log(`=== CREATING ${SETBACK_ZONE_DISTANCE}M SETBACK ZONE ===`);
    appState.layers.setback.removeAll(); // Clear previous setback zones

    // Union all frontage line geometries into one
    let frontageUnion = frontageLines[0].geometry;
    for (let i = 1; i < frontageLines.length; i++) {
        frontageUnion = geometryEngine.union([frontageUnion, frontageLines[i].geometry]);
    }

    // Buffer the frontage lines by 10 meters (creates zone extending into polygon)
    const setbackZone = geometryEngine.buffer(frontageUnion, SETBACK_ZONE_DISTANCE, "meters");

    // Intersect with polygon to keep only the part inside the property
    const setbackInsidePolygon = geometryEngine.intersect(setbackZone, polygonGraphic.geometry);

    if (setbackInsidePolygon) {
        // Add setback zone as a shaded area
        const setbackSymbol = {
            type: "simple-fill",
            color: [...COLORS.ORANGE_SETBACK, 0.25],  // Orange with transparency
            outline: {
                color: [...COLORS.ORANGE_SETBACK, 0.6],
                width: OUTLINE_WIDTH_THIN,
                style: "dash"
            }
        };

        const setbackGraphic = new Graphic({
            geometry: setbackInsidePolygon,
            symbol: setbackSymbol
        });

        // Add setback zone to dedicated layer
        appState.layers.setback.add(setbackGraphic);
        console.log(`${SETBACK_ZONE_DISTANCE}-meter setback zone created and added to toggleable layer`);
        return setbackInsidePolygon;
    } else {
        console.log('Could not create setback zone (intersection failed)');
        appState.layers.setback.removeAll();
        return null;
    }
}

/**
 * Add marker at a point on the map
 */
export function addMarkerAtPoint(point, PointClass, GraphicClass) {
    // Remove existing marker
    appState.layers.graphics.removeAll();

    // Create marker graphic
    appState.currentMarker = new GraphicClass({
        geometry: point,
        symbol: MARKER_SYMBOL_DEFAULT
    });

    // Add marker to map
    appState.layers.graphics.add(appState.currentMarker);

    // Save location
    appState.currentLocation.lat = point.latitude;
    appState.currentLocation.lng = point.longitude;

    // Update coordinates display
    updateCoordinatesDisplay(point.latitude, point.longitude);

    console.log('Marker added at:', point.latitude, point.longitude);
}


/**
 * Search for cadastral polygon by PIN
 */
export async function searchPolygonByPIN(pin, modules) {
    const statusElement = document.getElementById('pinSearchStatus');

    if (!pin || isNaN(pin)) {
        if (statusElement) {
            statusElement.textContent = 'Please enter a valid PIN number';
            statusElement.style.color = '#D32F2F';
            statusElement.style.display = 'block';
        }
        return;
    }

    if (statusElement) {
        statusElement.textContent = `Searching for PIN ${pin}...`;
        statusElement.style.color = '#666';
        statusElement.style.display = 'block';
    }

    try {
        const cadastreLayer = appState.layers.cadastre;

        if (!cadastreLayer) {
            throw new Error('Cadastre layer not loaded');
        }

        // Query for polygon with matching PIN
        const query = cadastreLayer.createQuery();
        query.where = `pin = ${pin}`;
        query.outFields = ["*"];
        query.returnGeometry = true;
        query.outSpatialReference = { wkid: 102100 }; // Web Mercator

        const result = await cadastreLayer.queryFeatures(query);

        if (result.features.length === 0) {
            if (statusElement) {
                statusElement.textContent = `No property found with PIN ${pin}`;
                statusElement.style.color = '#D32F2F';
            }
            console.log(`No polygon found with PIN: ${pin}`);
            return;
        }

        // Found the polygon
        const polygonGraphic = result.features[0];
        console.log(`Found polygon with PIN ${pin}:`, polygonGraphic.attributes);

        if (statusElement) {
            statusElement.textContent = `Found property PIN ${pin}`;
            statusElement.style.color = '#4CAF50';
        }

        // Zoom to the polygon
        if (appState.mapView) {
            await appState.mapView.goTo({
                target: polygonGraphic.geometry,
                zoom: PIN_SEARCH_ZOOM_LEVEL
            });
        }

        // Simulate a click on this polygon to trigger highlighting
        const centroid = polygonGraphic.geometry.centroid;
        const clickPoint = new modules.Point({
            x: centroid.x,
            y: centroid.y,
            spatialReference: polygonGraphic.geometry.spatialReference
        });

        // Highlight the polygon with frontage detection
        highlightCadastralFrontage(
            polygonGraphic,
            clickPoint,
            modules,
            null // No reverse geocode callback needed
        );

        // Clear the input after successful search
        const pinInput = document.getElementById('pinSearchInput');
        if (pinInput) {
            pinInput.value = '';
        }

    } catch (error) {
        console.error('Error searching for PIN:', error);
        if (statusElement) {
            statusElement.textContent = `Error: ${error.message}`;
            statusElement.style.color = '#D32F2F';
        }
    }
}

/**
 * Setup event listeners for PIN search
 */
export function setupPINSearchListeners(modules) {
    const pinInput = document.getElementById('pinSearchInput');
    const searchButton = document.getElementById('searchPinBtn');

    if (!pinInput || !searchButton) {
        console.warn('PIN search elements not found in DOM');
        return;
    }

    // Button click handler
    searchButton.addEventListener('click', () => {
        const pin = parseInt(pinInput.value);
        searchPolygonByPIN(pin, modules);
    });

    // Enter key handler
    pinInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const pin = parseInt(pinInput.value);
            searchPolygonByPIN(pin, modules);
        }
    });

    console.log('PIN search listeners set up');
}
