// Layer Controls
// Handles visibility toggles for map layers

import { appState, WESTERN_POWER_LAYERS } from './config.js';
import { createWesternPowerLayer } from './map-setup.js';

/**
 * Setup layer toggle controls in the sidebar
 */
export function setupLayerControls() {
    // Get toggle button elements
    const cadastreToggleBtn = document.getElementById('cadastreToggleBtn');
    const cadastreLinesToggleBtn = document.getElementById('cadastreLinesToggleBtn');
    const setbackToggleBtn = document.getElementById('setbackToggleBtn');
    const subdivisionsToggleBtn = document.getElementById('subdivisionsToggleBtn');
    const propertyAddressesToggleBtn = document.getElementById('propertyAddressesToggleBtn');
    const userMarkersToggleBtn = document.getElementById('userMarkersToggleBtn');
    const lodgedCadastralToggleBtn = document.getElementById('lodgedCadastralToggleBtn');
    const lodgedLinesToggleBtn = document.getElementById('lodgedLinesToggleBtn');

    // Get icon elements
    const cadastreIcon = document.getElementById('cadastreIcon');
    const cadastreLinesIcon = document.getElementById('cadastreLinesIcon');
    const setbackIcon = document.getElementById('setbackIcon');
    const subdivisionsIcon = document.getElementById('subdivisionsIcon');
    const propertyAddressesIcon = document.getElementById('propertyAddressesIcon');
    const userMarkersIcon = document.getElementById('userMarkersIcon');
    const lodgedCadastralIcon = document.getElementById('lodgedCadastralIcon');
    const lodgedLinesIcon = document.getElementById('lodgedLinesIcon');

    // Setup collapsible sections and controls
    setupSectionMinimize();
    setupUtilitySectionToggle();
    setupSuperMinimize();
    setupFilterActiveLayers();

    /**
     * Toggle layer visibility
     */
    function toggleLayer(layer, icon, layerName) {
        console.log(`🔧 toggleLayer called for: ${layerName}`, { layer, icon });

        if (!layer) {
            console.warn(`⚠️ ${layerName} layer not found`);
            return;
        }

        if (!icon) {
            console.warn(`⚠️ ${layerName} icon element not found`);
            return;
        }

        // Toggle visibility
        layer.visible = !layer.visible;

        // Update icon
        icon.textContent = layer.visible ? '👁️' : '🚫';

        // Update active layers count
        updateActiveLayersCount();

        console.log(`✅ ${layerName} layer visibility: ${layer.visible}`);
    }

    // Cadastral Boundaries toggle
    if (cadastreToggleBtn) {
        console.log('📌 Adding click listener for Cadastral Boundaries');
        cadastreToggleBtn.addEventListener('click', () => {
            console.log('🖱️ Click detected on Cadastral Boundaries button');
            toggleLayer(appState.layers.cadastre, cadastreIcon, 'Cadastral Boundaries');
        });
    } else {
        console.warn('⚠️ cadastreToggleBtn not found');
    }

    // Road / Boundary Lines toggle
    if (cadastreLinesToggleBtn) {
        cadastreLinesToggleBtn.addEventListener('click', () => {
            toggleLayer(appState.layers.cadastreLines, cadastreLinesIcon, 'Cadastral Lines');
        });
    }

    // Frontal Zone toggle
    if (setbackToggleBtn) {
        setbackToggleBtn.addEventListener('click', () => {
            toggleLayer(appState.layers.setback, setbackIcon, 'Setback Zone');
        });
    }

    // Property Subdivisions toggle
    if (subdivisionsToggleBtn) {
        subdivisionsToggleBtn.addEventListener('click', () => {
            toggleLayer(appState.layers.subdivision, subdivisionsIcon, 'Subdivisions');
        });
    }

    // Property Addresses toggle
    if (propertyAddressesToggleBtn) {
        propertyAddressesToggleBtn.addEventListener('click', () => {
            toggleLayer(appState.layers.property, propertyAddressesIcon, 'Property Addresses');
        });
    }

    // User Markers toggle
    if (userMarkersToggleBtn) {
        userMarkersToggleBtn.addEventListener('click', () => {
            toggleLayer(appState.layers.graphics, userMarkersIcon, 'User Markers');
        });
    }

    // Lodged Cadastral Boundaries toggle
    if (lodgedCadastralToggleBtn) {
        lodgedCadastralToggleBtn.addEventListener('click', () => {
            toggleLayer(appState.layers.lodgedCadastre, lodgedCadastralIcon, 'Lodged Cadastral Boundaries');
        });
    }

    // Lodged Cadastral Lines toggle
    if (lodgedLinesToggleBtn) {
        lodgedLinesToggleBtn.addEventListener('click', () => {
            toggleLayer(appState.layers.lodgedCadastralLines, lodgedLinesIcon, 'Lodged Cadastral Lines');
        });
    }

    // Setup Western Power utility layer toggles (all 18 layers with lazy-loading)
    setupWesternPowerToggles();

    console.log('Layer controls initialized');
    console.log('Button check:', {
        cadastreToggleBtn: !!cadastreToggleBtn,
        cadastreLinesToggleBtn: !!cadastreLinesToggleBtn,
        setbackToggleBtn: !!setbackToggleBtn,
        subdivisionsToggleBtn: !!subdivisionsToggleBtn,
        propertyAddressesToggleBtn: !!propertyAddressesToggleBtn,
        userMarkersToggleBtn: !!userMarkersToggleBtn
    });
    console.log('appState.layers:', appState.layers);
}

/**
 * Setup Western Power utility layer toggles with lazy-loading
 */
function setupWesternPowerToggles() {
    // Get all Western Power utility toggle buttons
    const utilityButtons = document.querySelectorAll('[data-layer]');

    utilityButtons.forEach(button => {
        const layerKey = button.getAttribute('data-layer');
        const icon = button.querySelector('.utility-icon');

        if (!layerKey || !icon) {
            console.warn(`Invalid Western Power button configuration for ${button.id}`);
            return;
        }

        button.addEventListener('click', () => {
            toggleWesternPowerLayer(layerKey, icon);
        });
    });
}

/**
 * Toggle a Western Power layer with lazy-loading
 * Creates the layer on first toggle if it doesn't exist
 */
function toggleWesternPowerLayer(layerKey, icon) {
    const layer = appState.layers[layerKey];
    const config = WESTERN_POWER_LAYERS[layerKey];

    if (!config) {
        console.error(`Unknown Western Power layer: ${layerKey}`);
        return;
    }

    // Layer doesn't exist - create it (lazy-loading)
    if (!layer) {
        console.log(`Lazy-loading Western Power layer: ${config.name}`);

        // Check if SLIP token is available
        if (!appState.slipToken) {
            console.error('SLIP token not available - cannot create Western Power layers');
            alert('Western Power data is not available. SLIP authentication may have failed.');
            return;
        }

        // Create the layer
        const newLayer = createWesternPowerLayer(layerKey);

        if (!newLayer) {
            console.error(`Failed to create Western Power layer: ${layerKey}`);
            alert(`Failed to create ${config.name} layer.`);
            return;
        }

        // Store layer in appState
        appState.layers[layerKey] = newLayer;

        // Add layer to map
        appState.map.add(newLayer);

        // Ensure electrical layer stays on top so pillar highlights are always visible
        if (appState.layers.electrical) {
            appState.map.reorder(appState.layers.electrical, appState.map.layers.length - 1);
        }

        // Special handling for pillars layer - also show electrical connection points
        if (layerKey === 'pillars' && appState.layers.electrical) {
            appState.layers.electrical.visible = true;
        }

        // Update icon to visible
        icon.textContent = '👁️';

        // Update active layers count
        updateActiveLayersCount();

        console.log(`✅ Western Power layer created and added to map: ${config.name}`);
        return;
    }

    // Layer exists - toggle visibility
    layer.visible = !layer.visible;

    // Special handling for pillars layer - also toggle electrical connection points
    if (layerKey === 'pillars' && appState.layers.electrical) {
        appState.layers.electrical.visible = layer.visible;
    }

    // Update icon
    icon.textContent = layer.visible ? '👁️' : '🚫';

    // Update active layers count
    updateActiveLayersCount();

    console.log(`${config.name} layer visibility: ${layer.visible}`);
}

/**
 * Update layer control icons to match current layer visibility
 */
export function updateLayerControlIcons() {
    const layers = appState.layers;

    // Update each icon based on layer visibility
    if (layers.cadastre) {
        document.getElementById('cadastreIcon').textContent = layers.cadastre.visible ? '👁️' : '🚫';
    }

    if (layers.cadastreLines) {
        document.getElementById('cadastreLinesIcon').textContent = layers.cadastreLines.visible ? '👁️' : '🚫';
    }

    if (layers.setback) {
        document.getElementById('setbackIcon').textContent = layers.setback.visible ? '👁️' : '🚫';
    }

    if (layers.subdivision) {
        document.getElementById('subdivisionsIcon').textContent = layers.subdivision.visible ? '👁️' : '🚫';
    }

    if (layers.property) {
        document.getElementById('propertyAddressesIcon').textContent = layers.property.visible ? '👁️' : '🚫';
    }

    // Update user markers icon
    if (layers.graphics) {
        document.getElementById('userMarkersIcon').textContent = layers.graphics.visible ? '👁️' : '🚫';
    }

    // Update lodged cadastral boundaries icon
    if (layers.lodgedCadastre) {
        document.getElementById('lodgedCadastralIcon').textContent = layers.lodgedCadastre.visible ? '👁️' : '🚫';
    }

    // Update lodged cadastral lines icon
    if (layers.lodgedCadastralLines) {
        document.getElementById('lodgedLinesIcon').textContent = layers.lodgedCadastralLines.visible ? '👁️' : '🚫';
    }

    // Update Western Power utility layer icons (all 18 layers)
    const utilityButtons = document.querySelectorAll('[data-layer]');
    utilityButtons.forEach(button => {
        const layerKey = button.getAttribute('data-layer');
        const icon = button.querySelector('.utility-icon');

        if (layerKey && icon) {
            const layer = layers[layerKey];

            // Special handling for pillars - show visible if either pillars or electrical is visible
            if (layerKey === 'pillars') {
                const pillarsVisible = (layer && layer.visible) || (layers.electrical && layers.electrical.visible);
                icon.textContent = pillarsVisible ? '👁️' : '🚫';
            } else {
                icon.textContent = (layer && layer.visible) ? '👁️' : '🚫';
            }
        }
    });

    // Update active layers count
    updateActiveLayersCount();

    console.log('Layer control icons updated');
}

/**
 * Count and display active (visible) API layers (Western Power only)
 */
function updateActiveLayersCount() {
    const layers = appState.layers;
    let activeCount = 0;
    const activeLayerNames = [];

    // Count only Western Power utility layers (API layers)
    Object.keys(WESTERN_POWER_LAYERS).forEach(layerKey => {
        const layer = layers[layerKey];
        const config = WESTERN_POWER_LAYERS[layerKey];

        if (layer && layer.visible) {
            activeCount++;
            activeLayerNames.push(config.name);
        }
    });

    // Update the display
    const countElement = document.getElementById('activeLayersCount');
    if (countElement) {
        if (activeCount === 0) {
            countElement.innerHTML = '<span style="color: #999;">No API layers visible</span>';
        } else {
            countElement.innerHTML = `<strong>${activeCount}</strong> API layer${activeCount > 1 ? 's' : ''} visible`;
        }
    }
}

/**
 * Setup collapsible utility section
 * Shows only visible utility layers when collapsed
 */
function setupUtilitySectionToggle() {
    const toggleBtn = document.getElementById('utilitySectionToggleBtn');
    const content = document.getElementById('utilitySectionContent');

    if (!toggleBtn || !content) {
        console.warn('⚠️ Utility section toggle button or content not found');
        return;
    }

    // Start collapsed
    content.style.display = 'none';
    toggleBtn.textContent = '▶';

    // Click handler for toggle button
    const toggleSection = () => {
        if (content.style.display === 'none') {
            // Expanding - show content
            content.style.display = 'block';
            toggleBtn.textContent = '▼';
        } else {
            // Collapsing - hide content
            content.style.display = 'none';
            toggleBtn.textContent = '▶';
        }
    };

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSection();
    });
}

/**
 * Setup super minimize - collapses all sections
 */
function setupSuperMinimize() {
    const superMinimizeBtn = document.getElementById('superMinimizeBtn');

    if (!superMinimizeBtn) return;

    let allCollapsed = false;

    superMinimizeBtn.addEventListener('click', () => {
        const sections = [
            { content: document.getElementById('generatedContent'), btn: document.getElementById('generatedMinimizeBtn') },
            { content: document.getElementById('viewLayersContent'), btn: document.getElementById('viewLayersMinimizeBtn') },
            { content: document.getElementById('utilitySectionContent'), btn: document.getElementById('utilitySectionToggleBtn') },
            { content: document.getElementById('toolsContent'), btn: document.getElementById('toolsMinimizeBtn') }
        ];

        allCollapsed = !allCollapsed;

        sections.forEach(({ content, btn }) => {
            if (content && btn) {
                if (allCollapsed) {
                    content.style.display = 'none';
                    btn.textContent = btn === document.getElementById('utilitySectionToggleBtn') ? '▶' : '+';
                } else {
                    content.style.display = 'block';
                    btn.textContent = btn === document.getElementById('utilitySectionToggleBtn') ? '▼' : '−';
                }
            }
        });

        superMinimizeBtn.textContent = allCollapsed ? '⊞' : '⊟';
    });
}

/**
 * Setup filter active layers - toggles showing only active layers
 */
function setupFilterActiveLayers() {
    const filterBtn = document.getElementById('filterActiveLayersBtn');

    if (!filterBtn) return;

    let filterActive = false;

    // Store original display states
    const allButtons = {};

    filterBtn.addEventListener('click', () => {
        filterActive = !filterActive;
        const layers = appState.layers;

        // Get all non-utility layer toggle buttons
        const layerButtons = [
            { id: 'cadastreToggleBtn', visible: layers.cadastre && layers.cadastre.visible },
            { id: 'cadastreLinesToggleBtn', visible: layers.cadastreLines && layers.cadastreLines.visible },
            { id: 'setbackToggleBtn', visible: layers.setback && layers.setback.visible },
            { id: 'subdivisionsToggleBtn', visible: layers.subdivision && layers.subdivision.visible },
            { id: 'propertyAddressesToggleBtn', visible: layers.property && layers.property.visible },
            { id: 'userMarkersToggleBtn', visible: layers.graphics && layers.graphics.visible },
            { id: 'lodgedCadastralToggleBtn', visible: layers.lodgedCadastre && layers.lodgedCadastre.visible },
            { id: 'lodgedLinesToggleBtn', visible: layers.lodgedCadastralLines && layers.lodgedCadastralLines.visible }
        ];

        layerButtons.forEach(({ id, visible }) => {
            const btn = document.getElementById(id);
            if (btn) {
                if (filterActive) {
                    // Store original display
                    allButtons[id] = btn.style.display || 'flex';
                    // Hide inactive layers
                    btn.style.display = visible ? 'flex' : 'none';
                } else {
                    // Restore original display
                    btn.style.display = allButtons[id] || 'flex';
                }
            }
        });

        // Handle Western Power utility buttons
        const utilityButtons = document.querySelectorAll('[data-layer]');
        utilityButtons.forEach(button => {
            const layerKey = button.getAttribute('data-layer');
            const layer = layers[layerKey];
            const visible = layer && layer.visible;

            if (filterActive) {
                allButtons[button.id] = button.style.display || 'flex';
                button.style.display = visible ? 'flex' : 'none';
            } else {
                button.style.display = allButtons[button.id] || 'flex';
            }
        });

        filterBtn.style.opacity = filterActive ? '1' : '0.5';
        filterBtn.title = filterActive ? 'Show all layers' : 'Show only active layers';
    });
}

/**
 * Setup minimize buttons for all sections
 */
function setupSectionMinimize() {
    const sections = [
        { btn: 'generatedMinimizeBtn', content: 'generatedContent' },
        { btn: 'viewLayersMinimizeBtn', content: 'viewLayersContent' },
        { btn: 'toolsMinimizeBtn', content: 'toolsContent' }
    ];

    sections.forEach(({ btn, content }) => {
        const button = document.getElementById(btn);
        const contentDiv = document.getElementById(content);

        if (!button || !contentDiv) return;

        button.addEventListener('click', () => {
            if (contentDiv.style.display === 'none') {
                contentDiv.style.display = 'block';
                button.textContent = '▼';
            } else {
                contentDiv.style.display = 'none';
                button.textContent = '▶';
            }
        });
    });
}

/**
 * Initialize default Western Power layers
 * Called on app startup to automatically load layers that should be visible by default
 */
export function initializeDefaultWesternPowerLayers() {
    // Auto-load pillars layer by default
    const pillarsButton = document.getElementById('pillarsToggleBtn');
    const pillarsIcon = pillarsButton?.querySelector('.utility-icon');

    if (pillarsButton && pillarsIcon) {
        console.log('Auto-loading Electrical Pillars layer...');
        toggleWesternPowerLayer('pillars', pillarsIcon);
    } else {
        console.warn('Could not find pillars toggle button or icon');
    }
}
