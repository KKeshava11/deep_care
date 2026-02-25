import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { Navigation2, Clock, MapPin, AlertCircle } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix leaflet default icons
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl,
    iconRetinaUrl,
    shadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const ambulanceIcon = L.divIcon({
    html: `<div style="background-color: var(--accent); color: white; padding: 5px; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 15px var(--accent);">🚑</div>`,
    className: 'custom-div-icon',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
});

function MapRangeAdjuster({ path }) {
    const map = useMap();
    useEffect(() => {
        if (path && path.length > 0) {
            const bounds = L.latLngBounds(path);
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [path, map]);
    return null;
}

export default function GoogleMapsView() {
    const location = useLocation();
    const [routeData, setRouteData] = useState(null);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const data = params.get('data');
        if (data) {
            try {
                setRouteData(JSON.parse(decodeURIComponent(data)));
            } catch (e) {
                console.error("Failed to parse route data", e);
            }
        }
    }, [location]);

    if (!routeData) {
        return (
            <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
                <div className="glass-panel text-center">
                    <AlertCircle size={48} color="var(--accent)" />
                    <h2>No Route Data Found</h2>
                    <p>Please launch navigation from the Ambulance Portal.</p>
                </div>
            </div>
        );
    }

    const { start, end, path, hospitalName, distance, duration } = routeData;

    return (
        <div style={{ height: '100vh', width: '100vw', position: 'relative', overflow: 'hidden' }}>
            {/* OVERLAY HEADER */}
            <div className="glass-panel" style={{
                position: 'absolute', top: 20, left: 20, right: 20, zIndex: 1000,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '15px 30px', borderRadius: '15px'
            }}>
                <div>
                    <h2 style={{ margin: 0, color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Navigation2 size={24} /> Navigating to {hospitalName}
                    </h2>
                    <p style={{ margin: 0, color: 'var(--text-muted)' }}>Emergency Priority Route</p>
                </div>
                <div style={{ display: 'flex', gap: '30px' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '1.2rem', fontWeight: 'bold' }}>
                            <Clock size={20} color="var(--accent)" /> {Math.round(duration / 60)} mins
                        </div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>ESTIMATED TIME</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '1.2rem', fontWeight: 'bold' }}>
                            <MapPin size={20} color="var(--success)" /> {(distance / 1000).toFixed(1)} km
                        </div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>DISTANCE</div>
                    </div>
                </div>
            </div>

            {/* FULLSCREEN MAP */}
            <MapContainer
                center={[start.lat, start.lng]}
                zoom={14}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />

                <Marker position={[start.lat, start.lng]} icon={ambulanceIcon} />

                <Marker position={[end.lat, end.lng]}>
                    <Popup>{hospitalName}</Popup>
                </Marker>

                {path && (
                    <Polyline
                        positions={path}
                        color="var(--accent)"
                        weight={8}
                        opacity={0.9}
                    />
                )}

                <MapRangeAdjuster path={path} />
            </MapContainer>

            {/* RE-ROUTE BUTTON / STATUS */}
            <div style={{
                position: 'absolute', bottom: 30, right: 30, zIndex: 1000,
                background: 'rgba(0,255,100,0.2)', padding: '10px 20px', borderRadius: '30px',
                border: '1px solid var(--success)', backdropFilter: 'blur(10px)',
                display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold'
            }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--success)', animation: 'pulse 2s infinite' }} />
                LIVE NAVIGATION ACTIVE
            </div>

            <style>{`
                @keyframes pulse {
                    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 255, 100, 0.7); }
                    70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(0, 255, 100, 0); }
                    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 255, 100, 0); }
                }
            `}</style>
        </div>
    );
}
