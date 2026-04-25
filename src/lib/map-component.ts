"use client";

/**
 * Build the <inf-map> Web Component script to inject into iframes.
 * Uses Leaflet.js (CDN) + OpenStreetMap tiles — no API key needed.
 *
 * Usage:
 *   <inf-map lat="35.0116" lng="135.7681" zoom="15" marker="Kiyomizudera Temple"></inf-map>
 *   <inf-map lat="48.8584" lng="2.2945" zoom="13"
 *     markers='[{"lat":48.8584,"lng":2.2945,"label":"Eiffel Tower"},{"lat":48.8606,"lng":2.3376,"label":"Louvre"}]'>
 *   </inf-map>
 */
export function buildMapComponentScript(): string {
  return `
(function() {
  if (customElements.get('inf-map')) return;

  var _leafletLoaded = false;
  var _leafletLoading = false;
  var _pendingMaps = [];

  function loadLeaflet(cb) {
    if (_leafletLoaded) { cb(); return; }
    _pendingMaps.push(cb);
    if (_leafletLoading) return;
    _leafletLoading = true;

    // Load CSS
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    // Load JS
    var script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = function() {
      _leafletLoaded = true;
      var cbs = _pendingMaps;
      _pendingMaps = [];
      for (var i = 0; i < cbs.length; i++) cbs[i]();
    };
    script.onerror = function() {
      _leafletLoading = false;
      // Show fallback for pending maps
      var cbs = _pendingMaps;
      _pendingMaps = [];
      for (var i = 0; i < cbs.length; i++) cbs[i]('error');
    };
    document.head.appendChild(script);
  }

  class InfMap extends HTMLElement {
    connectedCallback() {
      var self = this;
      var lat = parseFloat(this.getAttribute('lat') || '0');
      var lng = parseFloat(this.getAttribute('lng') || '0');
      var zoom = parseInt(this.getAttribute('zoom') || '13', 10);
      var markerLabel = this.getAttribute('marker') || '';
      var markersJson = this.getAttribute('markers') || '';

      // Container styles
      this.style.display = 'block';
      this.style.position = 'relative';
      this.style.overflow = 'hidden';
      this.style.borderRadius = this.style.borderRadius || '0.5rem';
      this.style.width = this.style.width || '100%';
      if (!this.style.height && !this.style.aspectRatio) {
        this.style.aspectRatio = '16/9';
      }

      // Loading placeholder
      this.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;background:linear-gradient(135deg,#e0f2fe 0%,#f0f9ff 50%,#e0e7ff 100%);">'
        + '<div style="font-size:28px;">🗺️</div>'
        + '<div style="font-size:11px;color:rgba(59,130,246,0.6);">Loading map...</div>'
        + '</div>';

      // Map container div
      var mapDiv = document.createElement('div');
      mapDiv.style.cssText = 'width:100%;height:100%;position:absolute;inset:0;z-index:1;';
      mapDiv.id = 'inf-map-' + Math.random().toString(36).slice(2, 8);

      loadLeaflet(function(err) {
        if (err) {
          self.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;background:linear-gradient(135deg,#fef3c7,#fde68a);">'
            + '<div style="font-size:24px;">🗺️</div>'
            + '<div style="font-size:11px;color:rgba(180,83,9,0.7);">Map unavailable</div>'
            + '<a href="https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lng + '#map=' + zoom + '/' + lat + '/' + lng + '" target="_blank" rel="noopener" style="font-size:11px;color:#2563eb;text-decoration:underline;">Open in OpenStreetMap</a>'
            + '</div>';
          return;
        }

        self.innerHTML = '';
        self.appendChild(mapDiv);

        var map = L.map(mapDiv.id, {
          scrollWheelZoom: false,
          attributionControl: true,
        }).setView([lat, lng], zoom);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
          maxZoom: 19,
        }).addTo(map);

        // Parse markers
        var markers = [];
        if (markersJson) {
          try { markers = JSON.parse(markersJson); } catch(e) {}
        }
        if (markerLabel && markers.length === 0) {
          markers.push({ lat: lat, lng: lng, label: markerLabel });
        }

        // Add markers
        var bounds = [];
        for (var i = 0; i < markers.length; i++) {
          var m = markers[i];
          var mlat = parseFloat(m.lat || lat);
          var mlng = parseFloat(m.lng || lng);
          var mk = L.marker([mlat, mlng]).addTo(map);
          if (m.label) mk.bindPopup('<b>' + m.label + '</b>');
          bounds.push([mlat, mlng]);
        }

        // Fit bounds if multiple markers
        if (bounds.length > 1) {
          map.fitBounds(bounds, { padding: [30, 30] });
        } else if (bounds.length === 1) {
          // Open popup for single marker
          map.eachLayer(function(layer) {
            if (layer.getPopup) {
              var popup = layer.getPopup();
              if (popup) layer.openPopup();
            }
          });
        }

        // Enable scroll zoom on click/focus
        map.on('click', function() { map.scrollWheelZoom.enable(); });
        map.on('mouseout', function() { map.scrollWheelZoom.disable(); });

        // Fix Leaflet tile rendering after container becomes visible
        setTimeout(function() { map.invalidateSize(); }, 200);
      });
    }
  }

  customElements.define('inf-map', InfMap);
})();
`;
}
