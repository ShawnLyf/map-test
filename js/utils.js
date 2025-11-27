// Utility Functions
// Geometry calculations and DOM helpers

import { WA_BOUNDS, appState } from './config.js';
import { clearConnectionLines } from './electrical-infrastructure.js';

/**
 * Enable the subdivision mode button
 */
function enableSubdivisionButton() {
    const btn = document.getElementById('subdivisionModeBtn');
    if (btn) {
        btn.disabled = false;
        btn.style.backgroundColor = '#F26D21';  // Orange (active color)
        btn.style.color = 'white';
        btn.style.cursor = 'pointer';
    }
}

/**
 * Disable the subdivision mode button
 */
function disableSubdivisionButton() {
    const btn = document.getElementById('subdivisionModeBtn');
    if (btn) {
        btn.disabled = true;
        btn.style.backgroundColor = '#BDBDBD';  // Gray (disabled color)
        btn.style.color = '#757575';
        btn.style.cursor = 'not-allowed';
    }
}

// =============================================================================
// GEOMETRY CALCULATIONS
// =============================================================================

/**
 * Calculate the centroid of a polygon
 */
export function calculatePolygonCentroid(geometry) {
    const ring = geometry.rings[0];
    let sumLat = 0;
    let sumLon = 0;
    let count = ring.length - 1; // Exclude last point (same as first)

    for (let i = 0; i < count; i++) {
        sumLon += ring[i][0];
        sumLat += ring[i][1];
    }

    return {
        lon: sumLon / count,
        lat: sumLat / count
    };
}

/**
 * Check if a point is inside a polygon using ray casting algorithm
 * This is the AUTHORITATIVE geometric test for polygon membership
 */
export function isPointInPolygon(lat, lon, polygonGeometry) {
    const ring = polygonGeometry.rings[0]; // Use outer ring
    let inside = false;

    // Ray casting algorithm: count how many times a ray from the point
    // crosses the polygon boundary
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1]; // [lon, lat]
        const xj = ring[j][0], yj = ring[j][1];

        // Check if ray crosses this edge
        const intersect = ((yi > lat) !== (yj > lat)) &&
                        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);

        if (intersect) inside = !inside;
    }

    return inside;
}

/**
 * Get orientation of a line (E-W, N-S, etc.)
 */
export function getLineOrientation(startPoint, endPoint) {
    const lon1 = startPoint[0];
    const lat1 = startPoint[1];
    const lon2 = endPoint[0];
    const lat2 = endPoint[1];

    // Calculate bearing of the line
    const bearing = calculateBearing(lat1, lon1, lat2, lon2);

    // Normalize to 0-180 since lines don't have direction
    const normalizedBearing = bearing % 180;

    if (normalizedBearing < 22.5 || normalizedBearing > 157.5) {
        return "N-S";
    } else if (normalizedBearing > 67.5 && normalizedBearing < 112.5) {
        return "E-W";
    } else if (normalizedBearing < 67.5) {
        return "NE-SW";
    } else {
        return "NW-SE";
    }
}

/**
 * Calculate bearing between two points (in degrees from north)
 */
export function calculateBearing(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
              Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

    let bearing = Math.atan2(y, x) * 180 / Math.PI;

    // Normalize to 0-360
    bearing = (bearing + 360) % 360;

    return bearing;
}

/**
 * Convert bearing to 8-point compass direction
 */
export function bearingTo8Point(bearing) {
    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
}

/**
 * Convert bearing to 16-point compass direction (legacy)
 */
export function bearingToCompass(bearing) {
    const directions = [
        "N", "NNE", "NE", "ENE",
        "E", "ESE", "SE", "SSE",
        "S", "SSW", "SW", "WSW",
        "W", "WNW", "NW", "NNW"
    ];

    const index = Math.round(bearing / 22.5) % 16;
    return directions[index];
}

/**
 * Determine if frontage is primarily N-S or E-W oriented
 */
export function getAxisOrientation(bearing) {
    // Normalize to 0-180 (since a line has no inherent direction)
    const normalizedBearing = bearing % 180;

    // If bearing is close to 0/180 (north-south) or 90 (east-west)
    if (normalizedBearing < 22.5 || normalizedBearing > 157.5) {
        return "North-South";
    } else if (normalizedBearing > 67.5 && normalizedBearing < 112.5) {
        return "East-West";
    } else if (normalizedBearing < 67.5) {
        return "Northeast-Southwest";
    } else {
        return "Northwest-Southeast";
    }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
}

/**
 * Check if coordinates are in Western Australia
 */
export function isInWesternAustralia(lng, lat) {
    return lng >= WA_BOUNDS.xmin && lng <= WA_BOUNDS.xmax &&
           lat >= WA_BOUNDS.ymin && lat <= WA_BOUNDS.ymax;
}

// =============================================================================
// DOM HELPER FUNCTIONS
// =============================================================================

/**
 * Update the address display in the UI
 */
export function updateAddressDisplay(address) {
    const addressStatus = document.getElementById('addressStatus');
    if (addressStatus) {
        addressStatus.textContent = 'Address: ' + address;
        addressStatus.style.color = '#333';
    }
}

/**
 * Update the coordinates display in the UI
 */
export function updateCoordinatesDisplay(lat, lng) {
    const coordsStatus = document.getElementById('coordinatesStatus');
    if (coordsStatus) {
        coordsStatus.textContent = 'Coordinates: ' + lat.toFixed(6) + ', ' + lng.toFixed(6);
        coordsStatus.style.color = '#333';
    }
}


/**
 * Update the polygon metadata display in the UI
 */
export function updatePolygonMetadata(polygonGraphic, validLines, frontageLines) {
    const metadataDiv = document.getElementById('polygonMetadata');
    const detailsDiv = document.getElementById('polygonDetails');

    if (!metadataDiv || !detailsDiv) return;

    const attrs = polygonGraphic.attributes;
    const geometry = polygonGraphic.geometry;

    // Build metadata HTML
    let html = '<div style="display: grid; grid-template-columns: auto 1fr; gap: 5px 10px;">';

    // Polygon OBJECTID (with subdivision indicator)
    const isSubdivision = attrs.subPolygon === true;
    const polygonId = attrs.__OBJECTID || attrs.OBJECTID || 'N/A';

    if (isSubdivision) {
        // Show subdivision number and original polygon ID
        const subIndex = attrs.subIndex !== undefined ? attrs.subIndex + 1 : '?';
        const originalId = attrs.originalPolygonId || 'Unknown';

        html += '<strong>Polygon Type:</strong>';
        html += `<span style="color: #9C27B0; font-weight: bold;">Subdivision ${subIndex}</span>`;

        html += '<strong>Based on ID:</strong>';
        html += `<span style="color: #666;">${originalId}</span>`;
    } else {
        // Show regular polygon ID
        html += '<strong>Polygon ID:</strong>';
        html += `<span>${polygonId}</span>`;
    }

    // PIN (Property Identification Number)
    if (attrs.pin) {
        html += '<strong>PIN:</strong>';
        html += `<span>${attrs.pin}</span>`;
    }

    // Lot Number
    if (attrs.lot_number) {
        html += '<strong>Lot Number:</strong>';
        html += `<span>${attrs.lot_number}</span>`;
    }

    // Land Type
    if (attrs.land_type) {
        html += '<strong>Land Type:</strong>';
        html += `<span>${attrs.land_type}</span>`;
    }

    // Legal Area
    if (attrs.legal_area) {
        html += '<strong>Legal Area:</strong>';
        html += `<span>${attrs.legal_area.toFixed(2)} m²</span>`;
    }

    // Calculated Area
    if (attrs.calc_area) {
        html += '<strong>Calculated Area:</strong>';
        html += `<span>${attrs.calc_area.toFixed(2)} m²</span>`;
    }

    // Geometry info
    html += '<strong>Vertices:</strong>';
    html += `<span>${geometry.rings[0].length}</span>`;

    // Boundary lines with usage_code breakdown
    html += '<strong>Total Lines:</strong>';
    html += `<span>${validLines.length}</span>`;

    // Group lines by usage_code and display dynamically
    const usageCodeCounts = {};
    const usageCodeLabels = {
        1: 'Frontage',
        2: 'Interior',
        11: 'Other'
    };

    // Count lines by usage_code (skip null entries for sub-polygons)
    let linesWithAttributes = 0;
    validLines.forEach(line => {
        if (line && line.attributes && line.attributes.usage_code !== undefined) {
            const code = line.attributes.usage_code;
            usageCodeCounts[code] = (usageCodeCounts[code] || 0) + 1;
            linesWithAttributes++;
        }
    });

    // Also count frontage lines if they're not already in validLines (for sub-polygons)
    if (linesWithAttributes === 0 && frontageLines && frontageLines.length > 0) {
        frontageLines.forEach(line => {
            if (line && line.attributes && line.attributes.usage_code !== undefined) {
                const code = line.attributes.usage_code;
                usageCodeCounts[code] = (usageCodeCounts[code] || 0) + 1;
            }
        });
    }

    // Display each usage_code with count
    const sortedCodes = Object.keys(usageCodeCounts).sort((a, b) => Number(a) - Number(b));
    if (sortedCodes.length > 0) {
        sortedCodes.forEach(code => {
            const count = usageCodeCounts[code];
            const label = usageCodeLabels[code];
            const color = code === '1' ? '#2E7D32' : '#666';  // Green for frontage, gray for others

            // Show code number only for unknown types (not in usageCodeLabels)
            if (label) {
                // Known type: Frontage, Interior, Other - don't show code number
                html += `<strong>${label}:</strong>`;
            } else {
                // Unknown type: show as "Code X"
                html += `<strong>Code ${code}:</strong>`;
            }
            html += `<span style="color: ${color};">${count}</span>`;
        });

        // For subdivisions, note that only frontage data is calculated
        if (isSubdivision && sortedCodes.length === 1 && sortedCodes[0] === '1') {
            html += `<strong style="font-size: 0.9em;">Interior/Other:</strong>`;
            html += `<span style="color: #999; font-size: 0.9em; font-style: italic;">Not calculated</span>`;
        }
    } else {
        // If no usage codes found, explicitly show Frontage: 0 for subdivisions
        if (isSubdivision) {
            html += `<strong>Frontage:</strong>`;
            html += `<span style="color: #999;">0</span>`;
            html += `<strong style="font-size: 0.9em;">Interior/Other:</strong>`;
            html += `<span style="color: #999; font-size: 0.9em; font-style: italic;">Not calculated</span>`;
        }
    }

    // Date info
    if (attrs.date_modif) {
        html += '<strong>Last Modified:</strong>';
        html += `<span>${new Date(attrs.date_modif).toLocaleDateString()}</span>`;
    }

    html += '</div>';

    // Add expandable raw attributes section
    html += '<div style="margin-top: 12px; border-top: 1px solid #E0E0E0; padding-top: 8px;">';
    html += '<details style="cursor: pointer;">';
    html += '<summary style="font-weight: bold; font-size: 11px; color: #666; margin-bottom: 4px;">RAW CADASTRAL ATTRIBUTES</summary>';
    html += '<div style="max-height: 300px; overflow-y: auto; font-size: 11px; margin-top: 8px; background-color: #F5F5F5; padding: 8px; border-radius: 4px;">';
    html += '<div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 8px; font-family: monospace;">';

    // Sort attributes alphabetically and display all of them
    const sortedKeys = Object.keys(attrs).sort();
    sortedKeys.forEach(key => {
        const value = attrs[key];

        // Skip internal ArcGIS fields
        if (key.startsWith('__') || key === 'shape' || key === 'geometry') {
            return;
        }

        // Format the value
        let displayValue = value;

        // Format dates (timestamps in milliseconds)
        if (key.includes('date') && typeof value === 'number' && value > 1000000000000) {
            displayValue = new Date(value).toLocaleDateString('en-AU', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        }
        // Format numbers with more than 6 digits (likely coordinates or IDs)
        else if (typeof value === 'number' && Math.abs(value) > 1000) {
            displayValue = value.toLocaleString();
        }
        // Handle null/undefined
        else if (value === null || value === undefined || value === '') {
            displayValue = '<span style="color: #999;">—</span>';
        }

        html += `<span style="color: #666; font-weight: 500;">${key}:</span>`;
        html += `<span style="color: #333;">${displayValue}</span>`;
    });

    html += '</div>';
    html += '</div>';
    html += '</details>';
    html += '</div>';

    detailsDiv.innerHTML = html;
    metadataDiv.style.display = 'block';

    // Enable subdivision button when property is selected
    enableSubdivisionButton();
}

/**
 * Hide the polygon metadata display
 */
export function hidePolygonMetadata() {
    const metadataDiv = document.getElementById('polygonMetadata');
    if (metadataDiv) {
        metadataDiv.style.display = 'none';
    }

    // Clear connection lines when no property is selected
    clearConnectionLines();

    // Restore cadastre layer opacity when no property is selected
    if (appState.layers.cadastre) {
        appState.layers.cadastre.opacity = 0.8;  // Restore to default
    }

    // Disable subdivision button when no property is selected
    disableSubdivisionButton();
}
