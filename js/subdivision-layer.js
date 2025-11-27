// Subdivision Layer
// Allows users to draw subdivision lines on selected cadastral polygons

import { appState } from './config.js';

let subdivisionMode = false;
let currentPolygonGeometry = null;
let currentPolygonGraphic = null; // Store the full graphic with attributes
let drawingPoints = []; // Array of { point, type: 'boundary' | 'midpoint', snapped: boolean }

/**
 * Create subdivision layer
 * @param {Object} GraphicsLayer - ArcGIS GraphicsLayer class
 * @returns {Object} Subdivision layer
 */
export function createSubdivisionLayer(GraphicsLayer) {
    const subdivisionLayer = new GraphicsLayer({
        id: "subdivisionLayer",
        title: "Property Subdivisions",
        visible: true,
        listMode: "show"
    });

    return subdivisionLayer;
}

/**
 * Enable subdivision drawing mode for a polygon
 * @param {Object} polygonGeometry - The selected cadastral polygon geometry
 * @param {Object} polygonGraphic - The full polygon graphic with attributes (optional)
 */
export function enableSubdivisionMode(polygonGeometry, polygonGraphic = null) {
    subdivisionMode = true;
    currentPolygonGeometry = polygonGeometry;
    currentPolygonGraphic = polygonGraphic;
    drawingPoints = [];

    console.log('Subdivision mode enabled for polygon');

    // Update UI to show subdivision mode is active
    showSubdivisionControls();
}

/**
 * Disable subdivision drawing mode
 */
export function disableSubdivisionMode() {
    subdivisionMode = false;
    currentPolygonGeometry = null;
    currentPolygonGraphic = null;
    drawingPoints = [];

    console.log('Subdivision mode disabled');

    // Update UI
    hideSubdivisionControls();
    updatePointListUI();

    // Reset main subdivision button
    const subdivisionBtn = document.getElementById('subdivisionModeBtn');
    const subdivisionBtnText = document.getElementById('subdivisionBtnText');
    if (subdivisionBtn) {
        subdivisionBtn.style.backgroundColor = '#F26D21';
        if (subdivisionBtnText) {
            subdivisionBtnText.textContent = 'Subdivision Mode';
        }
    }
}

/**
 * Check if subdivision mode is active
 * @returns {boolean}
 */
export function isSubdivisionModeActive() {
    return subdivisionMode;
}

/**
 * Handle click event when in subdivision mode
 * @param {Object} mapPoint - The clicked point
 * @param {Object} modules - ArcGIS modules (Graphic, geometryEngine)
 * @returns {boolean} True if point was handled
 */
export function handleSubdivisionClick(mapPoint, modules) {
    if (!subdivisionMode || !currentPolygonGeometry) {
        return false;
    }

    const { Graphic, geometryEngine } = modules;

    const pointGeometry = {
        type: "point",
        x: mapPoint.x,
        y: mapPoint.y,
        spatialReference: mapPoint.spatialReference
    };

    const isInside = geometryEngine.contains(currentPolygonGeometry, pointGeometry);

    // Find nearest point on polygon boundary
    const nearestEdgePoint = findNearestEdgePoint(mapPoint, currentPolygonGeometry, geometryEngine);
    const distanceToEdge = geometryEngine.distance(pointGeometry, nearestEdgePoint, "meters");

    console.log(`=== SUBDIVISION POINT ${drawingPoints.length + 1} ===`);
    console.log(`Click: (${mapPoint.x.toFixed(2)}, ${mapPoint.y.toFixed(2)})`);
    console.log(`Inside polygon: ${isInside}`);
    console.log(`Distance to nearest edge: ${distanceToEdge.toFixed(2)}m`);

    let finalPoint, pointType, wasSnapped;

    // First point ALWAYS snaps to edge (boundary point)
    if (drawingPoints.length === 0) {
        finalPoint = nearestEdgePoint;
        pointType = 'boundary';
        wasSnapped = true;
        console.log('First point → SNAP TO EDGE (boundary)');
    }
    // Point outside polygon → always snap to edge (boundary point)
    else if (!isInside) {
        finalPoint = nearestEdgePoint;
        pointType = 'boundary';
        wasSnapped = true;
        console.log('Outside polygon → SNAP TO EDGE (boundary)');
    }
    // Point inside polygon and close to edge (< 5m) → snap to edge (boundary point)
    else if (distanceToEdge < 5) {
        finalPoint = nearestEdgePoint;
        pointType = 'boundary';
        wasSnapped = true;
        console.log(`Close to edge (${distanceToEdge.toFixed(2)}m < 5m) → SNAP TO EDGE (boundary)`);
    }
    // Point inside polygon and far from edge → use as midpoint
    else {
        finalPoint = pointGeometry;
        pointType = 'midpoint';
        wasSnapped = false;
        console.log(`Far from edge (${distanceToEdge.toFixed(2)}m) → MIDPOINT`);
    }

    // Add point to drawing points array
    const pointData = {
        point: finalPoint,
        type: pointType,
        snapped: wasSnapped,
        originalClick: mapPoint
    };
    drawingPoints.push(pointData);

    // Draw point marker
    const pointSymbol = {
        type: "simple-marker",
        color: pointType === 'boundary' ? [255, 0, 255, 0.9] : [255, 165, 0, 0.9], // Magenta for boundary, Orange for midpoint
        size: pointType === 'boundary' ? "10px" : "8px",
        style: pointType === 'boundary' ? "diamond" : "circle",
        outline: {
            color: [255, 255, 255],
            width: 2
        }
    };

    const pointGraphic = new Graphic({
        geometry: finalPoint,
        symbol: pointSymbol
    });

    appState.layers.subdivision.add(pointGraphic);

    // Update point list UI
    updatePointListUI();

    // Check if we should complete the line
    // Complete when: we have at least 2 points AND the last point is a boundary
    if (drawingPoints.length >= 2 && pointType === 'boundary') {
        drawSubdivisionLine(Graphic, geometryEngine);
    }

    return true;
}

/**
 * Find nearest point on polygon boundary
 * @param {Object} clickPoint - The clicked point
 * @param {Object} polygonGeometry - Polygon geometry
 * @param {Object} geometryEngine - ArcGIS geometryEngine
 * @returns {Object} Nearest point on polygon boundary
 */
function findNearestEdgePoint(clickPoint, polygonGeometry, geometryEngine) {
    const rings = polygonGeometry.rings[0]; // Use first ring (outer boundary)

    let nearestPoint = null;
    let minDistance = Infinity;

    // Check each edge of the polygon
    for (let i = 0; i < rings.length - 1; i++) {
        const edgeStart = rings[i];
        const edgeEnd = rings[i + 1];

        // Create edge line segment
        const edgeGeometry = {
            type: "polyline",
            paths: [[edgeStart, edgeEnd]],
            spatialReference: polygonGeometry.spatialReference
        };

        // Find nearest coordinate on this edge
        const nearestOnEdge = geometryEngine.nearestCoordinate(edgeGeometry, clickPoint);

        if (nearestOnEdge && nearestOnEdge.distance < minDistance) {
            minDistance = nearestOnEdge.distance;
            nearestPoint = nearestOnEdge.coordinate;
        }
    }

    return nearestPoint;
}

/**
 * Draw subdivision line/polyline from accumulated points
 * @param {Object} Graphic - ArcGIS Graphic class
 * @param {Object} geometryEngine - ArcGIS geometryEngine
 */
function drawSubdivisionLine(Graphic, geometryEngine) {
    if (drawingPoints.length < 2) return;

    // Build path from all points
    const path = drawingPoints.map(pd => [pd.point.x, pd.point.y]);

    // Create polyline geometry
    const lineGeometry = {
        type: "polyline",
        paths: [path],
        spatialReference: drawingPoints[0].point.spatialReference
    };

    // Create line symbol
    const lineSymbol = {
        type: "simple-line",
        color: [255, 0, 255, 0.9], // Magenta
        width: 3,
        style: "solid",
        cap: "round"
    };

    // Determine subdivision type for description
    const types = drawingPoints.map(pd => pd.type);
    let subdivisionType;
    if (types.every(t => t === 'boundary')) {
        subdivisionType = 'boundary to boundary';
    } else {
        subdivisionType = `boundary to ${types.slice(1, -1).join(' to ')} to boundary`.replace(/\s+/g, ' ');
    }

    const lineGraphic = new Graphic({
        geometry: lineGeometry,
        symbol: lineSymbol,
        attributes: {
            subdivisionLine: true,
            subdivisionType: subdivisionType,
            pointCount: drawingPoints.length,
            createdAt: new Date().toISOString()
        }
    });

    appState.layers.subdivision.add(lineGraphic);

    console.log(`Subdivision line drawn: ${subdivisionType} (${drawingPoints.length} points)`);

    // Reset points for next line
    drawingPoints = [];
    updatePointListUI();
}

/**
 * Clear all subdivision lines
 */
export function clearSubdivisions() {
    if (appState.layers.subdivision) {
        appState.layers.subdivision.removeAll();
        drawingPoints = [];
        updatePointListUI();
        console.log('All subdivision lines cleared');
    }
}

/**
 * Get all subdivision lines
 * @returns {Array} Array of subdivision line graphics
 */
export function getSubdivisionLines() {
    if (!appState.layers.subdivision) return [];

    return appState.layers.subdivision.graphics.filter(g =>
        g.attributes && g.attributes.subdivisionLine
    ).toArray();
}

/**
 * Complete subdivision - split polygon and regenerate frontages/electrical nodes
 * @param {Object} modules - ArcGIS modules (Graphic, geometryEngine, Point)
 */
export async function completeSubdivision(modules) {
    if (!currentPolygonGeometry || !currentPolygonGraphic) {
        console.error('No polygon selected for subdivision');
        return;
    }

    const subdivisionLines = getSubdivisionLines();
    if (subdivisionLines.length === 0) {
        console.error('No subdivision lines drawn');
        return;
    }

    const { Graphic, geometryEngine, Point } = modules;

    console.log('=== COMPLETING SUBDIVISION ===');
    console.log(`Original polygon ID: ${currentPolygonGraphic.attributes.objectid || currentPolygonGraphic.attributes.__OBJECTID || currentPolygonGraphic.attributes.OBJECTID}`);
    console.log(`Subdivision lines: ${subdivisionLines.length}`);

    // CRITICAL: Store parent property's frontage BEFORE cutting
    // This allows us to propagate frontage to sub-polygons based on edge alignment
    const parentFrontageLines = appState.currentFrontageLines || [];
    console.log(`Parent property has ${parentFrontageLines.length} frontage line(s)`);

    try {
        // Step 1: Cut polygon with each subdivision line
        let subPolygons = [currentPolygonGeometry];

        for (const subdivisionLine of subdivisionLines) {
            const newSubPolygons = [];

            for (const poly of subPolygons) {
                const cutResult = geometryEngine.cut(poly, subdivisionLine.geometry);

                if (cutResult && cutResult.length > 0) {
                    // Successfully cut - add resulting polygons
                    newSubPolygons.push(...cutResult);
                    console.log(`Cut resulted in ${cutResult.length} sub-polygons`);
                } else {
                    // Cut failed - keep original polygon
                    newSubPolygons.push(poly);
                    console.warn('Cut operation failed for a polygon');
                }
            }

            subPolygons = newSubPolygons;
        }

        console.log(`Final result: ${subPolygons.length} sub-polygons`);

        // Step 2: For each sub-polygon, calculate frontage and generate electrical node
        const subPolygonResults = [];

        for (let i = 0; i < subPolygons.length; i++) {
            const subPoly = subPolygons[i];

            console.log(`\n=== Processing Sub-Polygon ${i + 1}/${subPolygons.length} ===`);

            // Calculate frontage lines for this sub-polygon using PARENT FRONTAGE PROPAGATION
            // This propagates the parent property's frontage to sub-polygon edges that align with it
            const subFrontageLines = await calculateSubPolygonFrontage(
                subPoly,
                appState.layers,
                geometryEngine,
                parentFrontageLines  // Pass parent's frontage for propagation
            );

            console.log(`Found ${subFrontageLines.length} frontage segments for sub-polygon ${i + 1}`);

            // Store result with original polygon reference
            subPolygonResults.push({
                geometry: subPoly,
                frontageLines: subFrontageLines,
                index: i,
                originalPolygonId: currentPolygonGraphic.attributes.objectid || currentPolygonGraphic.attributes.__OBJECTID || currentPolygonGraphic.attributes.OBJECTID || 'Unknown'
            });
        }

        // Step 3: Render sub-polygons on map
        renderSubPolygons(subPolygonResults, Graphic);

        // Step 4: Generate electrical nodes for each sub-polygon
        await generateElectricalNodesForSubPolygons(subPolygonResults, modules);

        // Step 5: Update node visualization for each sub-polygon
        await updateNodeVisualizationForSubPolygons(subPolygonResults, modules);

        console.log('=== SUBDIVISION COMPLETE ===');
        alert(`Subdivision complete! Created ${subPolygons.length} sub-polygons.`);

        // Exit subdivision mode
        disableSubdivisionMode();

    } catch (error) {
        console.error('Error completing subdivision:', error);
        alert(`Subdivision failed: ${error.message}`);
    }
}

/**
 * Calculate frontage lines for a sub-polygon
 * Uses COORDINATE MATCHING - compares sub-polygon edges against original parent frontage coordinates
 * @param {Object} subPolygon - Sub-polygon geometry
 * @param {Object} layers - Application layers (unused in new approach)
 * @param {Object} geometryEngine - ArcGIS geometryEngine
 * @param {Array} parentFrontageLines - Parent property's frontage lines to propagate
 * @returns {Promise<Array>} Promise resolving to frontage line segments for this sub-polygon
 */
async function calculateSubPolygonFrontage(subPolygon, layers, geometryEngine, parentFrontageLines = []) {
    console.log('  📊 Calculating sub-polygon frontage via GEOMETRIC PROXIMITY MATCHING');
    console.log(`  Sub-polygon spatial reference: ${subPolygon.spatialReference.wkid}`);
    console.log(`  Parent property has ${parentFrontageLines.length} frontage line(s) to propagate`);

    if (parentFrontageLines.length === 0) {
        console.log('  ⚠️ No parent frontage to propagate - sub-polygon will have no frontage');
        return [];
    }

    // Extract all edges from sub-polygon boundary
    const subPolygonEdges = extractPolygonEdges(subPolygon);
    console.log(`  Sub-polygon has ${subPolygonEdges.length} boundary edges`);

    const subFrontageLines = [];

    // For each sub-polygon edge, check if it lies along any parent frontage line
    for (let i = 0; i < subPolygonEdges.length; i++) {
        const edge = subPolygonEdges[i];

        for (let j = 0; j < parentFrontageLines.length; j++) {
            const parentFrontage = parentFrontageLines[j];

            // Check if this edge lies along the parent frontage line (geometric proximity)
            if (edgeMatchesFrontageLine(edge, parentFrontage.geometry, geometryEngine, subPolygon.spatialReference)) {
                // This edge is part of the parent frontage
                const frontageLineGeometry = {
                    type: "polyline",
                    paths: [[edge.start, edge.end]],
                    spatialReference: subPolygon.spatialReference
                };

                subFrontageLines.push({
                    geometry: frontageLineGeometry,
                    attributes: parentFrontage.attributes || {}
                });

                console.log(`    ✅ Edge ${i + 1} matches parent frontage line ${j + 1}`);
                break; // Don't check other frontage lines once we found a match
            }
        }
    }

    console.log(`  📍 Result: ${subFrontageLines.length} frontage segment(s) inherited from parent property`);

    return subFrontageLines;
}

/**
 * Extract edges from polygon boundary
 * @param {Object} polygon - Polygon geometry
 * @returns {Array} Array of edges with start/end coordinates
 */
function extractPolygonEdges(polygon) {
    const edges = [];
    const rings = polygon.rings[0]; // Use outer ring only

    for (let i = 0; i < rings.length - 1; i++) {
        edges.push({
            start: rings[i],
            end: rings[i + 1]
        });
    }

    return edges;
}

/**
 * Check if a polygon edge lies along a parent frontage line using distance-based matching
 */
function edgeMatchesFrontageLine(edge, frontageLineGeometry, geometryEngine, spatialReference) {
    const distanceThreshold = 2.0; // 2 meter tolerance (increased from 1m)

    // Create point geometries for edge endpoints
    const edgeStartPoint = {
        type: "point",
        x: edge.start[0],
        y: edge.start[1],
        spatialReference: spatialReference
    };

    const edgeEndPoint = {
        type: "point",
        x: edge.end[0],
        y: edge.end[1],
        spatialReference: spatialReference
    };

    // Calculate distance from endpoints to the frontage line
    const startDistance = geometryEngine.distance(edgeStartPoint, frontageLineGeometry, "meters");
    const endDistance = geometryEngine.distance(edgeEndPoint, frontageLineGeometry, "meters");

    // Check if both endpoints are close (removed midpoint check for simplicity)
    const bothEndpointsClose = (startDistance <= distanceThreshold) && (endDistance <= distanceThreshold);

    // Debug logging for edges that are close but not matching
    if ((startDistance <= 5 && endDistance <= 5) && !bothEndpointsClose) {
        console.log(`      🔍 Edge close but outside threshold: start=${startDistance.toFixed(2)}m, end=${endDistance.toFixed(2)}m`);
    }

    return bothEndpointsClose;
}

/**
 * Render sub-polygons on the map
 * @param {Array} subPolygonResults - Array of {geometry, frontageLines, index}
 * @param {Object} Graphic - ArcGIS Graphic class
 */
function renderSubPolygons(subPolygonResults, Graphic) {
    console.log('Rendering sub-polygons on map...');

    // Store sub-polygon data globally so we can access frontage when clicked
    appState.subPolygonData = subPolygonResults;

    // Colors for sub-polygons (cycle through these)
    const colors = [
        [100, 150, 255, 0.3],  // Blue
        [255, 150, 100, 0.3],  // Orange
        [150, 255, 100, 0.3],  // Green
        [255, 100, 200, 0.3],  // Pink
        [200, 100, 255, 0.3],  // Purple
        [100, 255, 200, 0.3]   // Cyan
    ];

    subPolygonResults.forEach((result, index) => {
        const color = colors[index % colors.length];

        const polygonSymbol = {
            type: "simple-fill",
            color: color,
            outline: {
                color: [color[0], color[1], color[2], 0.9],
                width: 2.5
            }
        };

        // Generate a unique ID for this sub-polygon that matches what was used for electrical node generation
        const subPolygonId = `SUB_${result.originalPolygonId}_${index}`;

        const polygonGraphic = new Graphic({
            geometry: result.geometry,
            symbol: polygonSymbol,
            attributes: {
                subPolygon: true,
                subIndex: index,  // 0-based index to match array
                frontageCount: result.frontageLines.length,
                objectid: subPolygonId,  // Add ID for electrical connection tracking
                originalPolygonId: result.originalPolygonId
            }
        });

        appState.layers.subdivision.add(polygonGraphic);
    });

    console.log(`Rendered ${subPolygonResults.length} sub-polygons`);
}

/**
 * Generate electrical nodes for each sub-polygon
 * @param {Array} subPolygonResults - Array of {geometry, frontageLines, index}
 * @param {Object} modules - ArcGIS modules
 */
async function generateElectricalNodesForSubPolygons(subPolygonResults, modules) {
    console.log('=== GENERATING ELECTRICAL NODES FOR SUB-POLYGONS ===');

    // Import the electrical infrastructure module
    const { generateOrFindConnectionNode } = await import('./electrical-infrastructure.js');

    for (const result of subPolygonResults) {
        if (result.frontageLines.length > 0) {
            // Create a temporary graphic for the sub-polygon with matching ID format
            const subPolygonId = `SUB_${result.originalPolygonId}_${result.index}`;

            const subPolygonGraphic = {
                geometry: result.geometry,
                attributes: {
                    objectid: subPolygonId,  // Use same ID format as rendered graphic
                    subPolygon: true,
                    subIndex: result.index,
                    originalPolygonId: result.originalPolygonId
                }
            };

            console.log(`Generating electrical node for sub-polygon ${result.index + 1} (ID: ${subPolygonId})...`);

            const electricalNode = generateOrFindConnectionNode(
                subPolygonGraphic,
                result.frontageLines,
                modules
            );

            if (electricalNode) {
                console.log(`  ✓ Electrical node ${electricalNode.id} created for sub-polygon ${result.index + 1}`);
            } else {
                console.log(`  ⚠ No electrical node created for sub-polygon ${result.index + 1}`);
            }
        } else {
            console.log(`Sub-polygon ${result.index + 1} has no frontage - skipping electrical node generation`);
        }
    }
}

/**
 * Update node visualization for all sub-polygons
 * Highlights nearby nodes and shows distance labels
 * @param {Array} subPolygonResults - Array of {geometry, frontageLines, index}
 * @param {Object} modules - ArcGIS modules
 */
async function updateNodeVisualizationForSubPolygons(subPolygonResults, modules) {
    console.log('=== UPDATING NODE VISUALIZATION FOR SUB-POLYGONS ===');

    // Import the electrical infrastructure module
    const { updateNodeVisualizationForProperty } = await import('./electrical-infrastructure.js');
    const { geometryEngine } = modules;

    // Collect all frontage lines from all sub-polygons
    const allFrontageLines = [];
    const allSubPolygonGeometries = [];
    const allSetbackZones = [];

    for (const result of subPolygonResults) {
        if (result.frontageLines.length > 0) {
            allFrontageLines.push(...result.frontageLines);
            allSubPolygonGeometries.push(result.geometry);

            // Calculate setback zone for this sub-polygon
            try {
                let frontageUnion = result.frontageLines[0].geometry;
                for (let i = 1; i < result.frontageLines.length; i++) {
                    frontageUnion = geometryEngine.union([frontageUnion, result.frontageLines[i].geometry]);
                }

                const setbackBuffer = geometryEngine.buffer(frontageUnion, 10, "meters");
                const setbackZone = geometryEngine.intersect(setbackBuffer, result.geometry);

                if (setbackZone) {
                    allSetbackZones.push(setbackZone);
                }
            } catch (error) {
                console.warn(`Could not create setback zone for sub-polygon ${result.index + 1}:`, error);
            }
        }
    }

    if (allFrontageLines.length > 0) {
        // Union all sub-polygon geometries into one combined area
        let combinedPolygon = allSubPolygonGeometries[0];
        for (let i = 1; i < allSubPolygonGeometries.length; i++) {
            combinedPolygon = geometryEngine.union([combinedPolygon, allSubPolygonGeometries[i]]);
        }

        // Union all setback zones if any exist
        let combinedSetback = null;
        if (allSetbackZones.length > 0) {
            combinedSetback = allSetbackZones[0];
            for (let i = 1; i < allSetbackZones.length; i++) {
                combinedSetback = geometryEngine.union([combinedSetback, allSetbackZones[i]]);
            }
        }

        // Update visualization once with all combined data
        updateNodeVisualizationForProperty(
            allFrontageLines,
            combinedPolygon,
            modules
        );

        console.log(`✓ Node visualization updated for all ${subPolygonResults.length} sub-polygons`);
    } else {
        console.log('No frontage lines found in any sub-polygon');
    }
}

/**
 * Update point list UI
 */
function updatePointListUI() {
    const pointListDiv = document.getElementById('subdivisionPointList');
    if (!pointListDiv) return;

    if (drawingPoints.length === 0) {
        pointListDiv.innerHTML = '<div style="font-size: 11px; color: #999; font-style: italic;">No points added yet</div>';
        return;
    }

    let html = '<div style="font-size: 11px; margin-bottom: 6px; color: #333; font-weight: bold;">Current Line:</div>';

    drawingPoints.forEach((pd, index) => {
        const icon = pd.type === 'boundary' ? '◆' : '●';
        const color = pd.type === 'boundary' ? '#FF00FF' : '#FFA500';
        const label = pd.type === 'boundary' ? 'Boundary' : 'Midpoint';

        html += `
            <div style="font-size: 11px; margin-bottom: 4px; padding: 4px; background-color: #f9f9f9; border-radius: 3px; display: flex; align-items: center;">
                <span style="color: ${color}; font-size: 14px; margin-right: 6px;">${icon}</span>
                <span style="flex: 1;">Point ${index + 1}: <strong>${label}</strong></span>
            </div>
        `;
    });

    // Show subdivision type if we have points
    if (drawingPoints.length >= 2) {
        const types = drawingPoints.map(pd => pd.type);
        let subdivisionType;
        if (types.every(t => t === 'boundary')) {
            subdivisionType = 'Boundary to Boundary';
        } else {
            const midpointCount = types.filter(t => t === 'midpoint').length;
            subdivisionType = `Boundary → ${midpointCount} Midpoint(s) → Boundary`;
        }

        html += `
            <div style="font-size: 11px; margin-top: 8px; padding: 6px; background-color: #E8F5E9; border-radius: 3px; color: #2E7D32; font-weight: bold;">
                Type: ${subdivisionType}
            </div>
        `;
    }

    pointListDiv.innerHTML = html;
}

/**
 * Show subdivision controls UI
 */
function showSubdivisionControls() {
    let controlsDiv = document.getElementById('subdivisionControls');

    if (!controlsDiv) {
        // Create controls div to insert into Map Controls sidebar
        controlsDiv = document.createElement('div');
        controlsDiv.id = 'subdivisionControls';
        controlsDiv.style.cssText = `
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid #E0E0E0;
        `;

        controlsDiv.innerHTML = `
            <button id="completeSubdivisionBtn" style="width: 100%; padding: 8px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; margin-bottom: 6px;">
                ✓ Complete Subdivision
            </button>
            <button id="clearSubdivisionBtn" style="width: 100%; padding: 6px; background-color: #FF5252; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; margin-bottom: 4px;">
                Clear Lines
            </button>
            <button id="exitSubdivisionBtn" style="width: 100%; padding: 6px; background-color: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; margin-bottom: 8px;">
                Exit Mode
            </button>
            <div style="font-size: 11px; margin-bottom: 6px; color: #666;">
                <div style="margin-bottom: 3px;">◆ Click near edges to snap to boundary</div>
                <div style="margin-bottom: 3px;">● Click inside to add midpoint</div>
                <div style="margin-bottom: 6px;">First and last points must be boundaries</div>
            </div>
            <div id="subdivisionPointList" style="margin-bottom: 8px; padding: 6px; background-color: #f5f5f5; border-radius: 4px; min-height: 30px;">
                <div style="font-size: 11px; color: #999; font-style: italic;">No points added yet</div>
            </div>
        `;

        // Insert into the Tools section of the Map Controls sidebar (after subdivision button)
        const subdivisionBtn = document.getElementById('subdivisionModeBtn');
        if (subdivisionBtn && subdivisionBtn.parentElement) {
            // Insert after the subdivision button
            subdivisionBtn.parentElement.insertBefore(controlsDiv, subdivisionBtn.nextSibling);
        }

        // Attach event listeners
        document.getElementById('completeSubdivisionBtn').addEventListener('click', async () => {
            // Need to get ArcGIS modules from appState
            const modules = {
                Graphic: appState.arcgisModules.Graphic,
                geometryEngine: appState.arcgisModules.geometryEngine,
                Point: appState.arcgisModules.Point
            };
            await completeSubdivision(modules);
        });
        document.getElementById('clearSubdivisionBtn').addEventListener('click', clearSubdivisions);
        document.getElementById('exitSubdivisionBtn').addEventListener('click', disableSubdivisionMode);
    }

    controlsDiv.style.display = 'block';
    updatePointListUI();
}

/**
 * Hide subdivision controls UI
 */
function hideSubdivisionControls() {
    const controlsDiv = document.getElementById('subdivisionControls');
    if (controlsDiv) {
        controlsDiv.style.display = 'none';
    }
}

/**
 * Setup subdivision mode button listener
 * Called once during app initialization
 */
export function setupSubdivisionListeners() {
    const subdivisionModeBtn = document.getElementById('subdivisionModeBtn');
    const subdivisionBtnText = document.getElementById('subdivisionBtnText');

    if (!subdivisionModeBtn) {
        console.warn('Subdivision mode button not found');
        return;
    }

    subdivisionModeBtn.addEventListener('click', () => {
        // Toggle subdivision mode
        if (subdivisionMode) {
            // Exit subdivision mode
            disableSubdivisionMode();
        } else {
            // Enter subdivision mode
            if (!appState.currentPolygon) {
                alert('Please select a property first');
                return;
            }

            // Enable subdivision mode with current polygon
            enableSubdivisionMode(appState.currentPolygon.geometry, appState.currentPolygon);

            // Update button appearance
            subdivisionModeBtn.style.backgroundColor = '#4CAF50';  // Green when active
            if (subdivisionBtnText) {
                subdivisionBtnText.textContent = 'Exit Subdivision';
            }

            console.log('Subdivision mode activated');
        }
    });

    console.log('Subdivision button listener initialized');
}
