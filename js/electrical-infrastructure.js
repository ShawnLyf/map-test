// Electrical Infrastructure
// Manages electricity connection nodes and service points

import { appState } from './config.js';

// Constants - Node Configuration
const NODE_CONFIG = {
    SHARING_THRESHOLD: 30,        // meters - buffer distance from frontage for node sharing
    SEARCH_RADIUS: 400,           // meters - limit node visualization updates to nearby nodes
    INSET_DISTANCE: 10,           // meters - distance to place node inside property from frontage edge
    LABEL_OFFSET: 15              // pixels - offset for distance text labels below nodes
};

// Constants - Node Visual Sizes
const NODE_SIZES = {
    ACTIVE: 14,                   // pixels - active node size
    POTENTIAL: 16,                // pixels - potential node size
    NEARBY_SCALE_FACTOR: 1.25     // scale factor for nearby nodes (25% larger)
};

// Constants - Node Colors
const NODE_COLORS = {
    PRIMARY: [0, 200, 0],                    // Green for primary node (connected to current property)
    SECONDARY: [50, 205, 50],                // Lime green for other active nodes
    POTENTIAL: [128, 128, 128, 0.3],         // Gray transparent
    POTENTIAL_OUTLINE: [128, 128, 128, 0.8], // Gray outline
    WHITE_OUTLINE: [255, 255, 255],          // White
    TEXT_COLOR: [50, 50, 50],                // Dark gray for text
    TEXT_HALO: [255, 255, 255]               // White halo for text
};

// Constants - Symbol Styles
const SYMBOL_STYLES = {
    OUTLINE_WIDTH: 2,
    TEXT_HALO_SIZE: "2px",
    TEXT_FONT_SIZE: 10,
    TEXT_FONT_WEIGHT: "bold"
};

// Storage for all electrical nodes
let electricalNodes = [];

/**
 * Electrical node structure
 * {
 *   id: "NODE_001",
 *   type: "service_point",
 *   position: { x, y, spatialReference },
 *   latitude: -32.xxxx,
 *   longitude: 115.xxxx,
 *   properties: ["polygon_id_1", "polygon_id_2"], // Properties using this node
 *   createdAt: timestamp,
 *   side: "left" | "right" // Which side of frontage
 * }
 */

/**
 * Ensure polygon geometry is in Web Mercator (102100) for accurate distance calculations
 */
function ensureWebMercator(polygonGeometry, geometryEngine) {
    if (polygonGeometry.spatialReference.wkid === 102100) {
        return polygonGeometry;
    }

    console.log('Converting polygon from WGS84 to Web Mercator for node calculations');
    const converted = geometryEngine.project(polygonGeometry, { wkid: 102100 });
    console.log(`Converted to Web Mercator (${converted.spatialReference.wkid})`);
    return converted;
}

/**
 * Get and convert frontage line endpoints to Web Mercator
 */
function getConvertedFrontageEndpoints(frontageFeature, geometryEngine) {
    const frontagePath = frontageFeature.geometry.paths[0];
    let startPoint = frontagePath[0];
    let endPoint = frontagePath[frontagePath.length - 1];

    // If frontage is in WGS84, convert coordinates to Web Mercator
    if (frontageFeature.geometry.spatialReference.wkid !== 102100) {
        const startPointGeom = geometryEngine.project(
            { type: "point", x: startPoint[0], y: startPoint[1], spatialReference: frontageFeature.geometry.spatialReference },
            { wkid: 102100 }
        );
        const endPointGeom = geometryEngine.project(
            { type: "point", x: endPoint[0], y: endPoint[1], spatialReference: frontageFeature.geometry.spatialReference },
            { wkid: 102100 }
        );
        startPoint = [startPointGeom.x, startPointGeom.y];
        endPoint = [endPointGeom.x, endPointGeom.y];
    }
    return { startPoint, endPoint };
}

/**
 * Calculate all potential node positions for a property
 * Considers both ends of frontage (first and last segments) and both sides (left and right)
 */
function calculatePotentialNodePositions(frontageLines, workingPolygonGeometry, geometryEngine) {
    const firstFrontage = frontageLines[0];
    const lastFrontage = frontageLines[frontageLines.length - 1];

    console.log(`Frontage segments: ${frontageLines.length} (analyzing first and last)`);

    // Get endpoints from first and last frontage segments
    const firstEndpoints = getConvertedFrontageEndpoints(firstFrontage, geometryEngine);
    const lastEndpoints = getConvertedFrontageEndpoints(lastFrontage, geometryEngine);

    // Calculate potential node positions at all four positions (both ends, both sides)
    // This covers corner lots and irregular frontages properly
    return [
        { pos: calculateNodePosition(firstEndpoints.startPoint, firstEndpoints.endPoint, workingPolygonGeometry, 'left', geometryEngine), label: 'first-left' },
        { pos: calculateNodePosition(firstEndpoints.startPoint, firstEndpoints.endPoint, workingPolygonGeometry, 'right', geometryEngine), label: 'first-right' },
        { pos: calculateNodePosition(lastEndpoints.startPoint, lastEndpoints.endPoint, workingPolygonGeometry, 'left', geometryEngine), label: 'last-left' },
        { pos: calculateNodePosition(lastEndpoints.startPoint, lastEndpoints.endPoint, workingPolygonGeometry, 'right', geometryEngine), label: 'last-right' }
    ];
}

/**
 * Create and render a potential electrical node
 */
function createAndRenderPotentialNode(potentialPositions, polygonId, modules) {
    console.log(`No nearby node within ${NODE_CONFIG.SHARING_THRESHOLD}m - creating POTENTIAL node`);

    // Remove any existing potential nodes for this property first
    removePotentialNodesForProperty(polygonId);

    // Choose the best position from the potential positions
    // Default to first-right, but could be enhanced to pick the position closest to polygon centroid
    const chosenPosition = potentialPositions[1].pos; // first-right
    const chosenSide = 'right';

    // Create potential electrical node (not yet real)
    const potentialNode = createElectricalNode(
        chosenPosition,
        polygonId,
        chosenSide,
        modules,
        true  // isPotential flag
    );

    // Add to storage
    electricalNodes.push(potentialNode);

    // Don't render here - let updateNodeVisualizationForProperty() handle all rendering
    // This avoids the render-remove-re-render cycle

    console.log(`Created POTENTIAL electrical node ${potentialNode.id} on ${chosenSide} side`);
    return potentialNode;
}

/**
 * Generate or find electrical connection node for a property
 */
export async function generateOrFindConnectionNode(polygonGraphic, frontageLines, modules) {
    if (!frontageLines || frontageLines.length === 0) {
        console.log('No frontage lines - cannot generate connection node');
        return null;
    }

    const { geometryEngine } = modules;
    const polygonId = polygonGraphic.attributes.objectid || polygonGraphic.attributes.__OBJECTID || polygonGraphic.attributes.OBJECTID;

    console.log(`🔌 Generating electrical node for property ${polygonId} (${electricalNodes.length} nodes in memory)`);

    // Ensure polygon is in Web Mercator for consistent distance calculations
    const workingPolygonGeometry = ensureWebMercator(polygonGraphic.geometry, geometryEngine);

    // Calculate property centroid for connection line drawing
    // Note: Using polygon.centroid property (available in 4.28, deprecated in 4.34+)
    const propertyCentroid = workingPolygonGeometry.centroid;

    // Calculate all potential node positions
    const potentialPositions = calculatePotentialNodePositions(frontageLines, workingPolygonGeometry, geometryEngine);

    // Check if there are nearby existing nodes/pillars we can share
    const nearbyNode = await findNearbyConnectionNode(frontageLines, workingPolygonGeometry, polygonId, geometryEngine);

    if (nearbyNode) {
        console.log(`✅ Sharing ${nearbyNode.isPillar ? 'pillar' : 'node'} ${nearbyNode.id} with ${nearbyNode.properties.length} properties`);

        // Store property centroid in node for connection line drawing
        if (!nearbyNode.propertyCentroids) {
            nearbyNode.propertyCentroids = {};
        }
        nearbyNode.propertyCentroids[polygonId] = propertyCentroid;

        // Remove any potential nodes for this property
        removePotentialNodesForProperty(polygonId);
        return nearbyNode;
    }

    // No nearby node/pillar found - create a potential node
    console.log('⚠️ No nearby pillars/nodes - creating potential node');
    const potentialNode = createAndRenderPotentialNode(potentialPositions, polygonId, modules);

    // Store property centroid for potential node too
    if (potentialNode && !potentialNode.propertyCentroids) {
        potentialNode.propertyCentroids = {};
    }
    if (potentialNode) {
        potentialNode.propertyCentroids[polygonId] = propertyCentroid;
    }

    return potentialNode;
}

/**
 * Calculate node position at frontage edge, 10m inside property
 */
function calculateNodePosition(startPoint, endPoint, polygonGeometry, side, geometryEngine) {
    // Choose the endpoint based on side
    const edgePoint = side === 'left' ? startPoint : endPoint;

    // Create a point at the edge
    const edgePointGeom = {
        type: "point",
        x: edgePoint[0],
        y: edgePoint[1],
        spatialReference: polygonGeometry.spatialReference
    };

    // Move the point inward perpendicular to the frontage, towards the interior
    // Calculate the perpendicular direction (inward)
    const dx = endPoint[0] - startPoint[0];
    const dy = endPoint[1] - startPoint[1];
    const length = Math.sqrt(dx * dx + dy * dy);

    // Perpendicular vector (rotated 90 degrees)
    let perpX = -dy / length;
    let perpY = dx / length;

    // Test both directions to find which goes inside the polygon
    const testPoint1 = {
        type: "point",
        x: edgePoint[0] + perpX * NODE_CONFIG.INSET_DISTANCE,
        y: edgePoint[1] + perpY * NODE_CONFIG.INSET_DISTANCE,
        spatialReference: polygonGeometry.spatialReference
    };

    const testPoint2 = {
        type: "point",
        x: edgePoint[0] - perpX * NODE_CONFIG.INSET_DISTANCE,
        y: edgePoint[1] - perpY * NODE_CONFIG.INSET_DISTANCE,
        spatialReference: polygonGeometry.spatialReference
    };

    // Choose the point that's inside the polygon
    const isInside1 = geometryEngine.contains(polygonGeometry, testPoint1);
    const isInside2 = geometryEngine.contains(polygonGeometry, testPoint2);

    let finalPosition;
    if (isInside1) {
        finalPosition = testPoint1;
    } else if (isInside2) {
        finalPosition = testPoint2;
    } else {
        // Fallback: just use the edge point (common for narrow polygons - not an error)
        finalPosition = edgePointGeom;
    }

    return finalPosition;
}

/**
 * Remove graphics from electrical layer matching a filter condition
 */
function removeElectricalGraphics(filterFn) {
    if (!appState.layers.electrical) {
        return 0;
    }

    const graphicsToRemove = [];
    appState.layers.electrical.graphics.forEach(graphic => {
        if (filterFn(graphic)) {
            graphicsToRemove.push(graphic);
        }
    });

    appState.layers.electrical.removeMany(graphicsToRemove);
    return graphicsToRemove.length;
}

/**
 * Calculate distance from a node to the current frontage lines
 */
function calculateDistanceToCurrentFrontage(node, geometryEngine) {
    if (!appState.currentFrontageLines || appState.currentFrontageLines.length === 0) {
        return null;
    }

    try {
        const frontageUnion = unionFrontageLines(appState.currentFrontageLines, geometryEngine);
        if (!frontageUnion) {
            return null;
        }

        // Calculate distance from node to frontage
        return geometryEngine.distance(node.position, frontageUnion, "meters");
    } catch (error) {
        console.warn('Could not calculate distance to frontage:', error);
        return null;
    }
}

/**
 * Create node symbol based on type, primary status, and nearby status
 */
function createNodeSymbol(node, isPrimary = false, isNearby = false) {
    const sizeFactor = isNearby ? NODE_SIZES.NEARBY_SCALE_FACTOR : 1.0;

    if (node.isPotential) {
        // Potential nodes: hollow diamond with dashed outline, semi-transparent
        return {
            type: "simple-marker",
            style: "diamond",
            color: NODE_COLORS.POTENTIAL,
            size: `${Math.round(NODE_SIZES.POTENTIAL * sizeFactor)}px`,
            outline: {
                color: NODE_COLORS.POTENTIAL_OUTLINE,
                width: SYMBOL_STYLES.OUTLINE_WIDTH,
                style: "dash"
            }
        };
    }

    // Active nodes: primary (green) or secondary (lime green)
    const color = isPrimary ? NODE_COLORS.PRIMARY : NODE_COLORS.SECONDARY;

    return {
        type: "simple-marker",
        style: "diamond",
        color: color,
        size: `${Math.round(NODE_SIZES.ACTIVE * sizeFactor)}px`,
        outline: isNearby ? null : {  // Remove white outline for nearby nodes
            color: NODE_COLORS.WHITE_OUTLINE,
            width: SYMBOL_STYLES.OUTLINE_WIDTH
        }
    };
}

/**
 * Union all frontage lines into a single geometry in Web Mercator (102100)
 * Converts spatial references as needed to ensure consistent meter-based calculations
 */
function unionFrontageLines(frontageLines, geometryEngine) {
    if (!frontageLines || frontageLines.length === 0) {
        return null;
    }

    let frontageUnion = frontageLines[0].geometry;

    // Convert to Web Mercator if needed for meter-based operations
    if (frontageUnion.spatialReference.wkid !== 102100) {
        frontageUnion = geometryEngine.project(frontageUnion, { wkid: 102100 });
    }

    // Union additional frontage lines
    for (let i = 1; i < frontageLines.length; i++) {
        let lineGeom = frontageLines[i].geometry;

        // Convert to Web Mercator if needed
        if (lineGeom.spatialReference.wkid !== 102100) {
            lineGeom = geometryEngine.project(lineGeom, { wkid: 102100 });
        }

        frontageUnion = geometryEngine.union([frontageUnion, lineGeom]);
    }

    return frontageUnion;
}

/**
 * Find nearby connection node that can be shared using frontage buffer zone
 */
async function findNearbyConnectionNode(frontageLines, polygonGeometry, currentPolygonId, geometryEngine) {
    // Step 1: Union all frontage line geometries into one
    const frontageUnion = unionFrontageLines(frontageLines, geometryEngine);
    if (!frontageUnion) {
        return null;
    }

    // Step 2: Create buffer zone around the frontage
    const frontageBuffer = geometryEngine.buffer(frontageUnion, NODE_CONFIG.SHARING_THRESHOLD, "meters");

    // Step 3: Check existing nodes in memory first
    let bestNode = null;
    let shortestDistance = Infinity;

    for (const node of electricalNodes) {
        // Skip potential nodes
        if (node.isPotential) {
            continue;
        }

        // If node is already serving this property, return it
        if (node.properties.includes(currentPolygonId)) {
            return node;
        }

        // Check if node position is contained within the frontage buffer zone
        const nodeIsInBuffer = geometryEngine.contains(frontageBuffer, node.position);

        if (nodeIsInBuffer) {
            // Calculate distance from node to frontage
            const distance = geometryEngine.distance(node.position, frontageUnion, "meters");

            // Select closest node
            if (distance < shortestDistance) {
                bestNode = node;
                shortestDistance = distance;
            }
        }
    }

    // Step 4: Query pillars layer for nearby pillars
    const pillarsLayer = appState.layers.pillars;
    if (pillarsLayer) {
        try {
            const query = pillarsLayer.createQuery();
            query.geometry = frontageBuffer;
            query.spatialRelationship = "intersects";
            query.returnGeometry = true;
            query.outFields = ["pick_id"];

            const result = await pillarsLayer.queryFeatures(query);

            // Check each pillar
            for (const pillarFeature of result.features) {
                const pickId = pillarFeature.attributes.pick_id;

                // Check if this pillar already exists in electricalNodes (has been used)
                const existingPillar = electricalNodes.find(n => n.id === pickId);

                if (existingPillar) {
                    if (existingPillar.properties.includes(currentPolygonId)) {
                        return existingPillar;
                    }

                    // Calculate distance from pillar to frontage
                    const distance = geometryEngine.distance(existingPillar.position, frontageUnion, "meters");

                    // Select closest pillar
                    if (distance < shortestDistance) {
                        bestNode = existingPillar;
                        shortestDistance = distance;
                    }
                } else {
                    // Create new pillar node entry
                    const newPillarNode = {
                        id: pickId,
                        type: "pillar",
                        position: pillarFeature.geometry,
                        latitude: pillarFeature.geometry.latitude,
                        longitude: pillarFeature.geometry.longitude,
                        properties: [],
                        createdAt: new Date().toISOString(),
                        side: null,
                        isPotential: false,
                        isPillar: true
                    };
                    electricalNodes.push(newPillarNode);

                    // Calculate distance from new pillar to frontage
                    const distance = geometryEngine.distance(newPillarNode.position, frontageUnion, "meters");

                    // Select closest pillar
                    if (distance < shortestDistance) {
                        bestNode = newPillarNode;
                        shortestDistance = distance;
                    }
                }
            }
        } catch (error) {
            console.error('Error querying pillars:', error);
        }
    }

    if (bestNode) {
        // Add property to node
        if (!bestNode.properties.includes(currentPolygonId)) {
            bestNode.properties.push(currentPolygonId);
        }
        return bestNode;
    }

    return null;
}

/**
 * Create electrical node object
 */
function createElectricalNode(position, polygonId, side, modules, isPotential = false) {
    const { Point } = modules;

    // Convert to lat/lng for display
    const point = new Point({
        x: position.x,
        y: position.y,
        spatialReference: position.spatialReference
    });

    const nodeId = isPotential
        ? `POTENTIAL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        : `NODE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
        id: nodeId,
        type: isPotential ? "potential_service_point" : "service_point",
        position: position,
        latitude: point.latitude,
        longitude: point.longitude,
        properties: [polygonId],
        createdAt: new Date().toISOString(),
        side: side,
        isPotential: isPotential
    };
}

/**
 * Render electrical node on the map
 */
function renderElectricalNode(node, modules, isPrimary = false, isNearby = false) {
    const { Graphic, geometryEngine } = modules;

    if (!appState.layers.electrical) {
        console.error(`Cannot render node ${node.id} - electrical layer not initialized`);
        return;
    }

    const nodeSymbol = createNodeSymbol(node, isPrimary, isNearby);

    const nodeType = node.isPotential ? "POTENTIAL Connection Point" : "Electrical Connection Point";
    const nodeDescription = node.isPotential
        ? `This is a potential connection point. No actual node exists on this property or within ${NODE_CONFIG.SHARING_THRESHOLD}m.`
        : "Active service point";

    // Calculate distance to current frontage if one is selected
    const distanceToFrontage = calculateDistanceToCurrentFrontage(node, geometryEngine);

    const nodeGraphic = new Graphic({
        geometry: node.position,
        symbol: nodeSymbol,
        attributes: {
            electricalNode: true,
            nodeId: node.id,
            properties: node.properties.join(', '),
            isPotential: node.isPotential || false,
            isNearby: isNearby
        },
        popupTemplate: {
            title: nodeType,
            content: `
                <div style="padding: 10px;">
                    <p style="color: ${node.isPotential ? '#888' : '#333'}; font-style: ${node.isPotential ? 'italic' : 'normal'};">${nodeDescription}</p>
                    ${isNearby ? `<p style="color: #00C800; font-weight: bold;">✓ Within ${NODE_CONFIG.SHARING_THRESHOLD}m sharing distance</p>` : ''}
                    ${distanceToFrontage !== null ? `<p style="background: #FFF3CD; padding: 8px; border-left: 4px solid #FFA500; margin: 10px 0;"><strong>Distance to Selected Property Frontage:</strong> <span style="font-size: 16px; color: #FF6B00;">${distanceToFrontage.toFixed(1)}m</span></p>` : ''}
                    <p><strong>Node ID:</strong> ${node.id}</p>
                    <p><strong>Type:</strong> ${node.isPotential ? 'Potential Service Point' : 'Service Point'}</p>
                    <p><strong>Location:</strong> ${node.side} side of frontage</p>
                    <p><strong>Properties ${node.isPotential ? 'Requiring' : 'Served'}:</strong> ${node.properties.length}</p>
                    <p><strong>Property IDs:</strong> ${node.properties.join(', ')}</p>
                    <p><strong>Coordinates:</strong> ${node.latitude.toFixed(6)}, ${node.longitude.toFixed(6)}</p>
                </div>
            `
        }
    });

    appState.layers.electrical.add(nodeGraphic);
}

/**
 * Clear all connection lines from the map
 */
export function clearConnectionLines() {
    if (!appState.layers.electrical) {
        return;
    }

    // Find and remove all connection line graphics
    const graphicsToRemove = [];
    appState.layers.electrical.graphics.forEach((graphic) => {
        if (graphic.attributes && graphic.attributes.connectionLine) {
            graphicsToRemove.push(graphic);
        }
    });

    graphicsToRemove.forEach((graphic) => {
        appState.layers.electrical.remove(graphic);
    });

    // Clear stored references in all nodes
    electricalNodes.forEach((node) => {
        if (node.connectionLines) {
            node.connectionLines = [];
        }
    });
}

/**
 * Draw connection line from node to currently selected property
 */
export function drawConnectionLines(node, currentPropertyId, modules) {
    // Only draw connection lines for active (non-potential) nodes
    if (!node || node.isPotential) {
        return;
    }

    if (!node.propertyCentroids || !currentPropertyId) {
        return;
    }

    const propertyCentroid = node.propertyCentroids[currentPropertyId];

    if (!propertyCentroid) {
        console.warn(`No centroid stored for property ${currentPropertyId} - connection line skipped`);
        return;
    }

    const { Graphic } = modules;

    try {
        // Create polyline from node to current property center
        const connectionLine = new Graphic({
            geometry: {
                type: "polyline",
                paths: [[
                    [node.position.x, node.position.y],
                    [propertyCentroid.x, propertyCentroid.y]
                ]],
                spatialReference: node.position.spatialReference
            },
            symbol: {
                type: "simple-line",
                color: node.isPillar ? [0, 200, 0, 0.7] : [255, 165, 0, 0.7],  // Green for pillars, orange for nodes
                width: 2,
                style: "dash",  // Dashed line
                cap: "round",
                join: "round"
            },
            attributes: {
                nodeId: node.id,
                propertyId: currentPropertyId,
                connectionLine: true
            }
        });

        // Add line to electrical layer
        appState.layers.electrical.add(connectionLine);

        // Store reference
        if (!node.connectionLines) {
            node.connectionLines = [];
        }
        node.connectionLines.push(connectionLine);
    } catch (error) {
        console.error(`Error drawing connection line for property ${currentPropertyId}:`, error);
    }
}

/**
 * Remove potential nodes for a specific property
 */
function removePotentialNodesForProperty(polygonId) {
    // Find all potential nodes for this property
    const potentialNodesToRemove = electricalNodes.filter(node =>
        node.isPotential && node.properties.includes(polygonId)
    );

    // Remove from storage
    electricalNodes = electricalNodes.filter(node =>
        !(node.isPotential && node.properties.includes(polygonId))
    );

    // Remove from map
    removeElectricalGraphics(graphic => {
        if (graphic.attributes && graphic.attributes.isPotential) {
            const nodeProperties = graphic.attributes.properties.split(', ');
            return nodeProperties.includes(polygonId.toString());
        }
        return false;
    });

    if (potentialNodesToRemove.length > 0) {
        console.log(`Removed ${potentialNodesToRemove.length} potential node(s) for property ${polygonId}`);
    }
}

/**
 * Remove all potential nodes from the map and storage
 * Called when polygon is deselected or a different polygon is selected
 */
export function removeAllPotentialNodes() {
    // Count how many potential nodes we're removing
    const potentialCount = electricalNodes.filter(node => node.isPotential).length;

    if (potentialCount === 0) {
        return; // No potential nodes to remove
    }

    // Remove from storage
    electricalNodes = electricalNodes.filter(node => !node.isPotential);

    // Remove from map
    const removedCount = removeElectricalGraphics(graphic => {
        return graphic.attributes && graphic.attributes.isPotential;
    });

    console.log(`Removed ${removedCount} potential node(s) from map`);
}

/**
 * Remove all electrical node graphics from the map (but keep data in memory)
 * Called when switching between polygons to clean up old visualizations
 * This removes ALL node graphics and distance labels, but preserves the electricalNodes array
 * All active nodes will be re-rendered by updateNodeVisualizationForProperty()
 */
export function clearAllElectricalNodeGraphics() {
    if (!appState.layers.electrical) {
        return;
    }

    // Remove all electrical node graphics
    const removedNodes = removeElectricalGraphics(graphic => {
        return graphic.attributes && graphic.attributes.electricalNode;
    });

    // Remove all distance labels
    const removedLabels = removeElectricalGraphics(graphic => {
        return graphic.attributes && graphic.attributes.distanceLabel;
    });

    console.log(`Cleared ${removedNodes} electrical node graphics and ${removedLabels} distance labels from map`);
    console.log(`Electrical nodes data preserved in memory: ${electricalNodes.length} nodes`);
}

/**
 * Update node visualization when a property is selected
 * Highlights nearby nodes (within 30m) and shows distance labels for nodes outside polygon
 */
export function updateNodeVisualizationForProperty(frontageLines, polygonGeometry, modules, primaryNodeId = null) {
    const { Graphic, geometryEngine } = modules;

    if (!frontageLines || frontageLines.length === 0) {
        return;
    }

    if (!appState.layers.electrical) {
        console.error('⚠️ Electrical layer not initialized');
        return;
    }

    // Store frontage lines in app state so distance calculations work when clicking nodes
    appState.currentFrontageLines = frontageLines;

    // Remove any existing distance text labels (we'll regenerate these)
    removeElectricalGraphics(graphic => {
        return graphic.attributes && graphic.attributes.distanceLabel;
    });

    // Create buffer zone around frontage for detecting nearby nodes
    const frontageUnion = unionFrontageLines(frontageLines, geometryEngine);
    if (!frontageUnion) {
        return;
    }

    const frontageBuffer = geometryEngine.buffer(frontageUnion, NODE_CONFIG.SHARING_THRESHOLD, "meters");

    // Create extended search area to limit which nodes we process
    const searchBuffer = geometryEngine.buffer(frontageUnion, NODE_CONFIG.SEARCH_RADIUS, "meters");

    // Filter to only nodes within search radius
    let nearbyNodes = electricalNodes.filter(node => {
        return geometryEngine.contains(searchBuffer, node.position);
    });

    // CRITICAL: If the primary node exists but is outside the search radius, add it anyway
    if (primaryNodeId) {
        const primaryNode = electricalNodes.find(n => n.id === primaryNodeId);
        if (primaryNode && !nearbyNodes.some(n => n.id === primaryNodeId)) {
            nearbyNodes.push(primaryNode);
        }
    }

    // Note: clearAllElectricalNodeGraphics() was already called before this function
    // so all graphics have been removed. We just need to re-render everything.

    // Ensure polygon is in Web Mercator
    let workingPolygon = polygonGeometry;
    if (polygonGeometry.spatialReference.wkid !== 102100) {
        workingPolygon = geometryEngine.project(polygonGeometry, { wkid: 102100 });
    }

    // Re-render only nearby nodes with updated styling
    let highlightedCount = 0;
    let distanceLabelCount = 0;

    for (const node of nearbyNodes) {
        // Check if this is the primary node (connected to current property)
        const isPrimary = primaryNodeId && node.id === primaryNodeId;

        // Check if node is within 30m of frontage
        const isWithin30m = geometryEngine.contains(frontageBuffer, node.position);

        // Primary node is ALWAYS highlighted and shown, even if beyond 30m
        // Other nodes only highlighted if within 30m
        const shouldRender = isPrimary || isWithin30m;

        if (shouldRender) {
            // Check if node is outside polygon
            const isOutsidePolygon = !geometryEngine.contains(workingPolygon, node.position);
            const isOnProperty = !isOutsidePolygon;
            let distanceToNode = null;

            // Calculate distance for nodes outside polygon
            if (isOutsidePolygon) {
                distanceToNode = geometryEngine.distance(node.position, workingPolygon, "meters");
            }

            // Render node with highlighting (primary = green, secondary = lime)
            renderElectricalNode(node, { ...modules, geometryEngine }, isPrimary, true);
            highlightedCount++;

            // Add labels
            if (isOnProperty) {
                addPropertyLabel(node, modules);
            } else if (distanceToNode !== null) {
                addDistanceLabel(node, distanceToNode, modules);
            }
            distanceLabelCount++;
        }
    }

    // If we have a primary node, also highlight connected distribution underground cables
    if (primaryNodeId) {
        const primaryNode = electricalNodes.find(n => n.id === primaryNodeId);
        if (primaryNode) {
            highlightConnectedCables(primaryNode, modules);
        }
    }
}

/**
 * Add distance text label below a node
 */
function addDistanceLabel(node, distance, modules) {
    const { Graphic } = modules;

    // Create point slightly below the node for text label
    const labelPosition = {
        type: "point",
        x: node.position.x,
        y: node.position.y - NODE_CONFIG.LABEL_OFFSET,
        spatialReference: node.position.spatialReference
    };

    const textSymbol = {
        type: "text",
        color: NODE_COLORS.TEXT_COLOR,
        haloColor: NODE_COLORS.TEXT_HALO,
        haloSize: SYMBOL_STYLES.TEXT_HALO_SIZE,
        text: `${distance.toFixed(1)}m`,
        font: {
            size: SYMBOL_STYLES.TEXT_FONT_SIZE,
            weight: SYMBOL_STYLES.TEXT_FONT_WEIGHT
        },
        xoffset: 0,
        yoffset: 0
    };

    const textGraphic = new Graphic({
        geometry: labelPosition,
        symbol: textSymbol,
        attributes: {
            distanceLabel: true,
            nodeId: node.id,
            distance: distance
        }
    });

    appState.layers.electrical.add(textGraphic);
}

/**
 * Add "On Site" label below a node that's inside the polygon
 */
function addPropertyLabel(node, modules) {
    const { Graphic } = modules;

    // Create point slightly below the node for text label
    const labelPosition = {
        type: "point",
        x: node.position.x,
        y: node.position.y - NODE_CONFIG.LABEL_OFFSET,
        spatialReference: node.position.spatialReference
    };

    const textSymbol = {
        type: "text",
        color: NODE_COLORS.TEXT_COLOR,
        haloColor: NODE_COLORS.TEXT_HALO,
        haloSize: SYMBOL_STYLES.TEXT_HALO_SIZE,
        text: "On Site",
        font: {
            size: SYMBOL_STYLES.TEXT_FONT_SIZE,
            weight: SYMBOL_STYLES.TEXT_FONT_WEIGHT
        },
        xoffset: 0,
        yoffset: 0
    };

    const textGraphic = new Graphic({
        geometry: labelPosition,
        symbol: textSymbol,
        attributes: {
            distanceLabel: true,  // Use same attribute for filtering
            nodeId: node.id
        }
    });

    appState.layers.electrical.add(textGraphic);
}

/**
 * Highlight distribution underground cables connected to a pillar
 * Queries the Distribution Underground Cables layer for cables with endpoints near the pillar
 * Auto-loads the layer if not already loaded
 */
async function highlightConnectedCables(pillarNode, modules) {
    const { geometryEngine } = modules;

    let cablesLayer = appState.layers.utilityUndergroundCables;

    // If layer doesn't exist, create it (lazy-loading)
    if (!cablesLayer) {
        if (!appState.slipToken) {
            return;
        }

        const { createWesternPowerLayer } = await import('./map-setup.js');
        const newLayer = createWesternPowerLayer('utilityUndergroundCables');

        if (!newLayer) {
            return;
        }

        appState.layers.utilityUndergroundCables = newLayer;
        appState.map.add(newLayer);

        // Ensure electrical layer stays on top
        if (appState.layers.electrical) {
            appState.map.reorder(appState.layers.electrical, appState.map.layers.length - 1);
        }

        cablesLayer = newLayer;
    }

    try {
        // Ensure pillar position is in Web Mercator for accurate meter-based buffer
        let pillarPosition = pillarNode.position;
        if (pillarPosition.spatialReference.wkid !== 102100) {
            pillarPosition = geometryEngine.project(pillarPosition, { wkid: 102100 });
        }

        // Create a small buffer around the pillar (margin of error for connection points)
        const connectionTolerance = 2; // 2 meters tolerance
        const searchBuffer = geometryEngine.buffer(pillarPosition, connectionTolerance, "meters");

        // Query for cables where endpoints intersect the buffer
        const query = cablesLayer.createQuery();
        query.geometry = searchBuffer;
        query.spatialRelationship = "intersects";
        query.outFields = ["*"];
        query.returnGeometry = true;

        const result = await cablesLayer.queryFeatures(query);

        if (result.features.length > 0) {
            // Filter to only cables where an endpoint is actually near the pillar
            // (not just cables that pass through the buffer area)
            const connectedCables = result.features.filter(feature => {
                if (!feature.geometry || !feature.geometry.paths) return false;

                // Check if any path has an endpoint within tolerance
                for (const path of feature.geometry.paths) {
                    if (path.length === 0) continue;

                    // Check start point
                    const startPoint = {
                        type: "point",
                        x: path[0][0],
                        y: path[0][1],
                        spatialReference: feature.geometry.spatialReference
                    };
                    const startDistance = geometryEngine.distance(startPoint, pillarNode.position, "meters");

                    // Check end point
                    const endPoint = {
                        type: "point",
                        x: path[path.length - 1][0],
                        y: path[path.length - 1][1],
                        spatialReference: feature.geometry.spatialReference
                    };
                    const endDistance = geometryEngine.distance(endPoint, pillarNode.position, "meters");

                    if (startDistance <= connectionTolerance || endDistance <= connectionTolerance) {
                        return true;
                    }
                }
                return false;
            });

            // Highlight the connected cables by making the layer visible and updating the icon
            if (connectedCables.length > 0) {
                if (!cablesLayer.visible) {
                    cablesLayer.visible = true;
                }

                // Update the icon in the UI
                const cablesButton = document.getElementById('utilityUndergroundCablesToggleBtn');
                const cablesIcon = cablesButton?.querySelector('.utility-icon');
                if (cablesIcon) {
                    cablesIcon.textContent = '👁️';
                }
            }
        }
    } catch (error) {
        console.error('Error querying connected cables:', error);
    }
}
