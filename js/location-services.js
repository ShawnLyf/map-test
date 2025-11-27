// Location Services
// Geocoding, reverse geocoding, and address search

import { WA_BOUNDS, appState } from './config.js';
import { isInWesternAustralia, updateAddressDisplay } from './utils.js';

/**
 * Search for an address on the map
 */
export function searchAddressOnMap(Point, Graphic, addMarkerCallback) {
    const searchInput = document.getElementById('addressSearchInput');
    const address = searchInput ? searchInput.value.trim() : '';

    if (!address) {
        alert('Please enter an address to search');
        return;
    }

    console.log('Searching for:', address);

    const serviceUrl = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";

    const searchParams = new URLSearchParams({
        SingleLine: address + ', Western Australia, Australia',
        f: 'json',
        outFields: '*',
        maxLocations: 1,
        searchExtent: `${WA_BOUNDS.xmin},${WA_BOUNDS.ymin},${WA_BOUNDS.xmax},${WA_BOUNDS.ymax}`
    });

    fetch(serviceUrl + '?' + searchParams.toString())
        .then(response => response.json())
        .then(data => {
            if (data.candidates && data.candidates.length > 0) {
                const candidate = data.candidates[0];

                // Check if location is in Western Australia
                if (isInWesternAustralia(candidate.location.x, candidate.location.y)) {
                    const point = new Point({
                        latitude: candidate.location.y,
                        longitude: candidate.location.x
                    });

                    console.log('Location found:', point);

                    // Add marker
                    addMarkerCallback(point, Point, Graphic);

                    // Zoom to location
                    appState.mapView.goTo({
                        center: point,
                        zoom: 16
                    }, {
                        duration: 1000
                    });

                    // Update display
                    updateAddressDisplay(candidate.address);
                    appState.currentLocation.address = candidate.address;

                    // Mark that address search has been performed
                    appState.addressSearchPerformed = true;

                    // Hide suggestions
                    hideSuggestions();
                } else {
                    alert('Please enter an address in Western Australia.');
                }
            } else {
                alert('Address not found. Please try a different search.');
            }
        })
        .catch(error => {
            console.error('Geocoding error:', error);
            alert('Error searching for address. Please try again.');
        });
}

/**
 * Get address suggestions based on search text
 */
export function getAddressSuggestions(searchText, Point, Graphic, addMarkerCallback) {
    if (!searchText || searchText.length < 3) {
        hideSuggestions();
        return;
    }

    const serviceUrl = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/suggest";

    const searchParams = new URLSearchParams({
        text: searchText + ', Western Australia, Australia',
        f: 'json',
        maxSuggestions: 8,
        countryCode: 'AUS',
        searchExtent: `${WA_BOUNDS.xmin},${WA_BOUNDS.ymin},${WA_BOUNDS.xmax},${WA_BOUNDS.ymax}`
    });

    fetch(serviceUrl + '?' + searchParams.toString())
        .then(response => response.json())
        .then(data => {
            if (data.suggestions && data.suggestions.length > 0) {
                showSuggestions(data.suggestions, Point, Graphic, addMarkerCallback);
            } else {
                hideSuggestions();
            }
        })
        .catch(error => {
            console.error('Error getting suggestions:', error);
            hideSuggestions();
        });
}

/**
 * Show suggestions dropdown
 */
function showSuggestions(suggestions, Point, Graphic, addMarkerCallback) {
    hideSuggestions();

    const searchContainer = document.querySelector('.map-search');
    if (!searchContainer) return;

    appState.suggestionsList = document.createElement('div');
    appState.suggestionsList.className = 'address-suggestions';
    appState.suggestionsList.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: white;
        border: 2px solid #F26D21;
        border-top: none;
        border-radius: 0 0 6px 6px;
        max-height: 300px;
        overflow-y: auto;
        z-index: 1000;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;

    suggestions.forEach(suggestion => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.textContent = suggestion.text;
        item.style.cssText = `
            padding: 12px 15px;
            cursor: pointer;
            border-bottom: 1px solid #f0f0f0;
            transition: background-color 0.2s;
            font-size: 14px;
        `;

        item.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#FFF5F0';
        });

        item.addEventListener('mouseleave', function() {
            this.style.backgroundColor = 'white';
        });

        item.addEventListener('click', function() {
            selectSuggestion(suggestion, Point, Graphic, addMarkerCallback);
        });

        appState.suggestionsList.appendChild(item);
    });

    searchContainer.style.position = 'relative';
    searchContainer.appendChild(appState.suggestionsList);
}

/**
 * Select a suggestion from the dropdown
 */
function selectSuggestion(suggestion, Point, Graphic, addMarkerCallback) {
    const searchInput = document.getElementById('addressSearchInput');
    if (searchInput) {
        searchInput.value = suggestion.text;
    }

    const serviceUrl = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";

    const searchParams = new URLSearchParams({
        magicKey: suggestion.magicKey,
        f: 'json',
        outFields: '*'
    });

    fetch(serviceUrl + '?' + searchParams.toString())
        .then(response => response.json())
        .then(data => {
            if (data.candidates && data.candidates.length > 0) {
                const candidate = data.candidates[0];

                // Check if location is in Western Australia
                if (isInWesternAustralia(candidate.location.x, candidate.location.y)) {
                    const point = new Point({
                        latitude: candidate.location.y,
                        longitude: candidate.location.x
                    });

                    // Add marker
                    addMarkerCallback(point, Point, Graphic);

                    // Zoom to location
                    appState.mapView.goTo({
                        center: point,
                        zoom: 16
                    }, {
                        duration: 1000
                    });

                    // Update display
                    updateAddressDisplay(candidate.address);
                    appState.currentLocation.address = candidate.address;

                    // Mark that address search has been performed
                    appState.addressSearchPerformed = true;
                } else {
                    alert('Selected address is not in Western Australia.');
                }
            }
        })
        .catch(error => {
            console.error('Error getting address details:', error);
        });

    hideSuggestions();
}

/**
 * Reverse geocode coordinates to get address
 */
export function reverseGeocode(lat, lng) {
    const serviceUrl = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode";

    fetch(serviceUrl + '?location=' + lng + ',' + lat + '&f=json')
        .then(response => response.json())
        .then(data => {
            if (data && data.address) {
                console.log('Address found:', data.address);
                const fullAddress = data.address.Match_addr || data.address.LongLabel || 'Location selected';
                updateAddressDisplay(fullAddress);
                appState.currentLocation.address = fullAddress;
            } else {
                updateAddressDisplay('Location selected (lat: ' + lat.toFixed(5) + ', lng: ' + lng.toFixed(5) + ')');
            }
        })
        .catch(error => {
            console.error('Reverse geocoding error:', error);
            updateAddressDisplay('Location selected (lat: ' + lat.toFixed(5) + ', lng: ' + lng.toFixed(5) + ')');
        });
}

/**
 * Hide the suggestions dropdown
 */
export function hideSuggestions() {
    if (appState.suggestionsList) {
        appState.suggestionsList.remove();
        appState.suggestionsList = null;
    }
}

/**
 * Setup event listeners for address search
 */
export function setupAddressSearchListeners(Point, Graphic, addMarkerCallback) {
    // Map search button
    const searchBtn = document.getElementById('searchAddressBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', function() {
            searchAddressOnMap(Point, Graphic, addMarkerCallback);
        });
    }

    // Address search input - autocomplete
    const searchInput = document.getElementById('addressSearchInput');
    if (searchInput) {
        let debounceTimer;

        searchInput.addEventListener('input', function(e) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function() {
                getAddressSuggestions(e.target.value, Point, Graphic, addMarkerCallback);
            }, 300);
        });

        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchAddressOnMap(Point, Graphic, addMarkerCallback);
            }
        });

        // Hide suggestions when clicking outside
        document.addEventListener('click', function(e) {
            if (!searchInput.contains(e.target) && !e.target.closest('.address-suggestions')) {
                hideSuggestions();
            }
        });
    }
}
