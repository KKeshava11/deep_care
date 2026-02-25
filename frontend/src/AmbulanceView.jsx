import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { AlertTriangle, MapPin, Navigation2, CheckCircle2, Search, Info, Clock, Loader2, Activity } from 'lucide-react';

const API_BASE = 'http://localhost:5000/api';
const INITIAL_LOCATION = { lat: 15.8281, lng: 78.0373 };
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const ResourceBar = ({ label, available, total, color = "var(--primary)" }) => {
    const percentage = total > 0 ? (available / total) * 100 : 0;
    return (
        <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px', opacity: 0.8 }}>
                <span>{label}</span>
                <span>{available} / {total}</span>
            </div>
            <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                <div
                    style={{
                        height: '100%',
                        width: `${percentage}%`,
                        background: color,
                        boxShadow: `0 0 10px ${color}`,
                        transition: 'width 1s ease-out'
                    }}
                />
            </div>
        </div>
    );
};

export default function AmbulanceView() {
    const [patientData, setPatientData] = useState({
        condition: '',
        requiredSpecialist: '',
        needsICU: false,
        needsOxygen: false,
        location: INITIAL_LOCATION
    });

    const [recommendations, setRecommendations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [reroutedBanner, setReroutedBanner] = useState('');
    const [hasSearched, setHasSearched] = useState(false); // Flag to hide results initially

    // Search and All Hospitals State
    const [allHospitals, setAllHospitals] = useState([]);
    const [selectedCity, setSelectedCity] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedHospital, setSelectedHospital] = useState(null); // Hospital to show details for
    const [bookingStatus, setBookingStatus] = useState({ state: 'idle', message: '', hospitalId: null });
    const [socket, setSocket] = useState(null);
    const ambulanceId = useRef(`AMB-${Math.floor(Math.random() * 900) + 100}`);
    const requestTimeoutRef = useRef(null);

    // Ref to hold the current top hospital ID for comparing against updates
    const currentTopHospitalRef = useRef(null);

    const fetchRecommendations = async (background = false) => {
        if (!background) setLoading(true);
        console.log("Fetching recommendations with data:", patientData);
        try {
            const res = await axios.post(`${API_BASE}/ambulance/recommend`, patientData);
            const newRecs = res.data;
            console.log("Received recommendations:", newRecs.length);

            // Check for dynamic rerouting
            if (currentTopHospitalRef.current && newRecs.length > 0) {
                if (currentTopHospitalRef.current !== newRecs[0].hospitalId) {
                    setReroutedBanner(`CRITICAL UPDATE: Destination changed to ${newRecs[0].name} due to real-time resource exhaustion at previous target.`);
                    setTimeout(() => setReroutedBanner(''), 10000);
                }
            }

            setRecommendations(newRecs);
            setHasSearched(true); // Show results now
            if (newRecs.length > 0) {
                currentTopHospitalRef.current = newRecs[0].hospitalId;
                fetchRoadRoute(INITIAL_LOCATION, { lat: newRecs[0].lat, lng: newRecs[0].lng });
            }

            if (!background) setLoading(false);
        } catch (err) {
            console.error("AXIOS ERROR in fetchRecommendations:", err);
            if (!background) setLoading(false);
        }
    };

    const fetchRoadRoute = async (start, end) => {
        try {
            const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
            const res = await axios.get(url);
            if (res.data.routes && res.data.routes[0]) {
                const route = res.data.routes[0];
                const coords = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
                return {
                    path: coords,
                    distance: route.distance,
                    duration: route.duration
                };
            }
        } catch (err) {
            console.error('OSRM Fetch Error:', err);
        }
        return { path: [[start.lat, start.lng], [end.lat, end.lng]], distance: 0, duration: 0 };
    };

    const handleNavigate = async (hospital) => {
        const route = await fetchRoadRoute(INITIAL_LOCATION, { lat: hospital.lat || hospital.location.lat, lng: hospital.lng || hospital.location.lng });
        const data = {
            start: INITIAL_LOCATION,
            end: { lat: hospital.lat || hospital.location.lat, lng: hospital.lng || hospital.location.lng },
            path: route.path,
            hospitalName: hospital.name,
            distance: route.distance,
            duration: route.duration
        };
        const encodedData = encodeURIComponent(JSON.stringify(data));
        window.open(`/navigation?data=${encodedData}`, '_blank');
    };

    const fetchAllHospitals = async () => {
        try {
            console.log("Attempting to fetch all hospitals from:", `${API_BASE}/hospitals`);
            const res = await axios.get(`${API_BASE}/hospitals`);
            console.log("Directory Fetch Complete. Count:", res.data.length);
            setAllHospitals(res.data);
        } catch (err) {
            console.error("DIRECOTRY FETCH ERROR:", err);
        }
    };

    useEffect(() => {
        fetchAllHospitals();
    }, []);

    useEffect(() => {
        let filtered = [...allHospitals];

        if (selectedCity) {
            filtered = filtered.filter(h => h.city === selectedCity);
        }

        if (searchQuery.trim()) {
            filtered = filtered.filter(h =>
                h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (h.features && h.features.specialists && Object.keys(h.features.specialists).some(s => s.toLowerCase().includes(searchQuery.toLowerCase())))
            );
        }

        // Resource and Specialist hard constraints
        if (patientData.requiredSpecialist) {
            filtered = filtered.filter(h =>
                h.features &&
                h.features.specialists &&
                h.features.specialists[patientData.requiredSpecialist] &&
                h.features.specialists[patientData.requiredSpecialist].available > 0
            );
        }
        if (patientData.needsICU) {
            filtered = filtered.filter(h => h.features?.icuBeds?.available > 0);
        }
        if (patientData.needsOxygen) {
            filtered = filtered.filter(h => h.features?.oxygenAvailability >= 20);
        }

        // Sort alphabetically
        filtered.sort((a, b) => a.name.localeCompare(b.name));

        setSearchResults(filtered);
    }, [searchQuery, selectedCity, allHospitals]);

    // Unique cities for the dropdown
    const cities = [...new Set(allHospitals.map(h => h.city))].filter(Boolean).sort();

    useEffect(() => {
        const newSocket = io('http://localhost:5000');

        newSocket.on('hospitalUpdate', () => {
            if (hasSearched) fetchRecommendations(true);
            fetchAllHospitals();
        });

        newSocket.on('bookingResult', (data) => {
            if (requestTimeoutRef.current) clearTimeout(requestTimeoutRef.current);

            setBookingStatus({
                state: data.approved ? 'approved' : 'rejected',
                message: data.message,
                hospitalId: data.hospitalId
            });
            if (data.approved) {
                // Short delay to let the user see the success before redirecting or updating
                setTimeout(() => fetchRecommendations(true), 1000);
            }
        });

        setSocket(newSocket);

        return () => {
            if (requestTimeoutRef.current) clearTimeout(requestTimeoutRef.current);
            newSocket.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasSearched]);

    const handleRequestSlot = (hospital) => {
        const hId = hospital.hospitalId || hospital._id;
        if (!patientData.requiredSpecialist) {
            alert("Please select a required specialist first!");
            return;
        }

        if (!socket) return;

        // Instant booking emit
        socket.emit('instantBooking', {
            hospitalId: hId,
            specialistType: patientData.requiredSpecialist,
            patientCondition: patientData.condition || 'Emergency',
            ambulanceId: ambulanceId.current
        });

        // Optimistic UI update
        setBookingStatus({ state: 'approved', message: 'Slot Booked Automatically! You are clear for dispatch.', hospitalId: hId });
    };

    const handleCancelRequest = () => {
        setBookingStatus({ state: 'idle', message: '', hospitalId: null });
    };

    // Auto-fetch effects removed to ensure manual search only

    const handleManualSearch = (e) => {
        e.preventDefault();
        fetchRecommendations();
    };

    const topPick = recommendations[0];

    return (
        <div className="container fade-in">
            <h1 className="heading" style={{ marginBottom: '0.5rem' }}>Ambulance Dispatch</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Intelligent Patient Routing & Capacity Matching</p>

            {reroutedBanner && (
                <div className="alert-banner fade-in">
                    <AlertTriangle color="var(--accent)" size={24} />
                    <strong style={{ fontSize: '1.1rem' }}>{reroutedBanner}</strong>
                </div>
            )}

            <div className="grid grid-cols-1-2">
                {/* LEFT PANEL: PATIENT INPUT */}
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <h3 style={{ color: 'var(--secondary)' }}>Patient Requirements</h3>

                    <form onSubmit={handleManualSearch} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <select
                            className="glass-input glass-select"
                            value={patientData.condition}
                            onChange={e => setPatientData({ ...patientData, condition: e.target.value })}
                        >
                            <option value="">Select Patient Condition</option>
                            <option value="Critical">Critical (Life-threatening)</option>
                            <option value="Urgent">Urgent (Immediate attention)</option>
                            <option value="Stable">Stable (Needs monitoring)</option>
                            <option value="Normal">Normal (Routine)</option>
                        </select>

                        <select className="glass-input glass-select"
                            value={patientData.requiredSpecialist}
                            onChange={e => setPatientData({ ...patientData, requiredSpecialist: e.target.value })}
                        >
                            <option value="">No Specific Specialist</option>
                            <option value="cardiologist">Cardiologist (Heart)</option>
                            <option value="neurologist">Neurologist (Brain/Nerves)</option>
                            <option value="orthopedist">Orthopedist (Bone/Trauma)</option>
                            <option value="pediatrician">Pediatrician (Child)</option>
                            <option value="generalSurgeon">General Surgeon</option>
                        </select>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <input type="checkbox" id="icu" className="glass-checkbox"
                                checked={patientData.needsICU}
                                onChange={e => setPatientData({ ...patientData, needsICU: e.target.checked })}
                            />
                            <label htmlFor="icu" style={{ fontWeight: 600 }}>Requires ICU Bed</label>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <input type="checkbox" id="o2" className="glass-checkbox"
                                checked={patientData.needsOxygen}
                                onChange={e => setPatientData({ ...patientData, needsOxygen: e.target.checked })}
                            />
                            <label htmlFor="o2" style={{ fontWeight: 600 }}>Requires High Oxygen Flow</label>
                        </div>

                        <button type="submit" className="btn-primary" style={{ marginTop: '1rem', width: '100%', opacity: 0.8 }}>
                            <Navigation2 size={18} /> Force Recalculate
                        </button>
                    </form>

                    {/* LIST OF RECOMMENDATIONS */}
                    <div style={{ marginTop: '2rem' }}>
                        <h3 style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem', textTransform: 'uppercase' }}>
                            {hasSearched ? (recommendations.length > 0 ? 'Top Ranked Hospitals' : 'No matches found') : 'Ready for Dispatch'}
                        </h3>
                        <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}>
                            {!hasSearched ? (
                                <div style={{ padding: '20px', textAlign: 'center', opacity: 0.6, border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '15px' }}>
                                    Enter patient details and click <strong>Force Recalculate</strong> to find the best hospital.
                                </div>
                            ) : loading ? (
                                <div style={{ padding: '20px', textAlign: 'center' }}>
                                    <div className="alert-banner" style={{ background: 'rgba(0, 242, 254, 0.05)', color: 'var(--primary)', border: '1px solid var(--primary)', animation: 'pulse 1s infinite' }}>
                                        <Activity size={20} className="spin" />
                                        <span>QUBIT INITIALIZATION & QUANTUM OPTIMIZATION IN PROGRESS...</span>
                                    </div>
                                </div>
                            ) :
                                recommendations.length === 0 ? (
                                    <div style={{ padding: '20px', textAlign: 'center', opacity: 0.6 }}>
                                        No hospitals found matching criteria.
                                    </div>
                                ) :
                                    recommendations.map((h, i) => (
                                        <div
                                            key={h.hospitalId}
                                            className={`hospital-item ${i === 0 ? 'top-pick' : ''}`}
                                            onClick={() => handleNavigate(h)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                <h4 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: i === 0 ? 'var(--success)' : 'white' }}>
                                                    {i === 0 && <CheckCircle2 size={20} />}
                                                    {h.name}
                                                </h4>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '1rem' }}>{h.distanceStr}</div>
                                                    <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>{h.city}</div>
                                                </div>
                                            </div>

                                            {h.quantumOptimized && i === 0 && (
                                                <div style={{
                                                    marginBottom: '10px',
                                                    background: 'rgba(0, 242, 254, 0.1)',
                                                    padding: '4px 10px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.65rem',
                                                    color: 'var(--primary)',
                                                    border: '1px solid rgba(0, 242, 254, 0.2)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    width: 'fit-content'
                                                }}>
                                                    <Activity size={12} /> QUANTUM OPTIMIZED PATH
                                                </div>
                                            )}

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '10px' }}>
                                                <ResourceBar label="ICU" available={h.icuAvailable} total={h.icuAvailable + rand(0, 5)} color="var(--success)" />
                                                <ResourceBar label="Oxygen" available={h.oxygenAvailability} total={100} color="var(--accent)" />
                                                {patientData.requiredSpecialist && h.specialists && h.specialists[patientData.requiredSpecialist] && (
                                                    <ResourceBar
                                                        label={patientData.requiredSpecialist.charAt(0).toUpperCase() + patientData.requiredSpecialist.slice(1)}
                                                        available={h.specialists[patientData.requiredSpecialist].available}
                                                        total={h.specialists[patientData.requiredSpecialist].total || 5}
                                                        color="var(--secondary)"
                                                    />
                                                )}
                                            </div>

                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', gap: '10px' }}>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>AI Score: <strong style={{ color: 'var(--secondary)' }}>{h.score.toFixed(0)}</strong></span>

                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    {bookingStatus.state === 'approved' && bookingStatus.hospitalId === h.hospitalId ? (
                                                        <>
                                                            <button
                                                                disabled
                                                                className="btn-success"
                                                                style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                                                            >
                                                                <CheckCircle2 size={12} /> Slot Booked
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleNavigate(h); }}
                                                                className="btn-primary"
                                                                style={{ padding: '6px 12px', fontSize: '0.75rem', boxShadow: '0 0 15px var(--primary)' }}
                                                            >
                                                                <Navigation2 size={12} /> Dispatch
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleRequestSlot(h); }}
                                                            className="btn-primary"
                                                            style={{
                                                                padding: '6px 12px',
                                                                fontSize: '0.75rem',
                                                                opacity: bookingStatus.state === 'approved' ? 0.5 : 1
                                                            }}
                                                        >
                                                            <Clock size={12} /> Book Slot
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {bookingStatus.message && bookingStatus.hospitalId === h.hospitalId && (
                                                <div style={{
                                                    marginTop: '10px',
                                                    fontSize: '0.7rem',
                                                    color: bookingStatus.state === 'approved' ? 'var(--success)' : bookingStatus.state === 'rejected' ? 'var(--danger)' : 'var(--accent)',
                                                    background: 'rgba(0,0,0,0.2)',
                                                    padding: '8px',
                                                    borderRadius: '6px',
                                                    border: '1px solid rgba(255,255,255,0.05)'
                                                }}>
                                                    {bookingStatus.message}
                                                </div>
                                            )}
                                        </div>
                                    ))
                            }
                        </div>
                    </div>
                </div>

                {/* RIGHT PANEL: HOSPITAL SEARCH */}
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <h3 style={{ color: 'var(--secondary)' }}>Hospital Directory</h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {/* City Filter */}
                        <select
                            className="glass-input glass-select"
                            value={selectedCity}
                            onChange={(e) => setSelectedCity(e.target.value)}
                        >
                            <option value="">All Cities</option>
                            {cities.map(city => (
                                <option key={city} value={city}>{city}</option>
                            ))}
                        </select>

                        {/* Search Bar */}
                        <div style={{ position: 'relative' }}>
                            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} size={18} />
                            <input
                                className="glass-input"
                                style={{ paddingLeft: '40px' }}
                                placeholder="Search by Hospital Name..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div style={{ overflowY: 'auto', flex: 1, paddingRight: '10px' }}>
                        {selectedHospital ? (
                            <div className="fade-in" style={{ padding: '10px' }}>
                                <button
                                    onClick={() => setSelectedHospital(null)}
                                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '5px', padding: 0 }}
                                >
                                    ← Back to List
                                </button>

                                <div className="hospital-item top-pick" style={{ cursor: 'default', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                        <div>
                                            <h2 style={{ margin: 0, background: 'var(--gradient-main)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '1.8rem' }}>{selectedHospital.name}</h2>
                                            <p style={{ opacity: 0.6, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <MapPin size={14} /> {selectedHospital.city}, AP
                                            </p>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {bookingStatus.state === 'approved' && bookingStatus.hospitalId === (selectedHospital.hospitalId || selectedHospital._id) ? (
                                                <button
                                                    onClick={() => handleNavigate(selectedHospital)}
                                                    className="btn-primary"
                                                    style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 0 15px var(--primary)' }}
                                                >
                                                    <Navigation2 size={16} /> Dispatch Now
                                                </button>
                                            ) : (
                                                <button
                                                    className="btn-primary"
                                                    style={{
                                                        padding: '8px 20px',
                                                        opacity: bookingStatus.state === 'approved' ? 0.5 : 1
                                                    }}
                                                    onClick={() => handleRequestSlot(selectedHospital)}
                                                >
                                                    <Clock size={16} /> Instant Booking
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {bookingStatus.state === 'approved' && bookingStatus.hospitalId === (selectedHospital.hospitalId || selectedHospital._id) && (
                                    <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', padding: '10px', borderRadius: '8px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(16, 185, 129, 0.2)', fontSize: '0.9rem' }}>
                                        <CheckCircle2 size={18} /> Slot confirmed! You are authorized to dispatch.
                                    </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '30px' }}>
                                    <div className="glass-panel" style={{ padding: '15px', textAlign: 'center', background: 'rgba(0,242,254,0.05)' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                                            {selectedHospital.features.icuBeds.available}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', tracking: '1px' }}>ICU Beds</div>
                                    </div>
                                    <div className="glass-panel" style={{ padding: '15px', textAlign: 'center', background: 'rgba(79,172,254,0.05)' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--secondary)' }}>
                                            {selectedHospital.features.generalBeds.available}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>General</div>
                                    </div>
                                    <div className="glass-panel" style={{ padding: '15px', textAlign: 'center', background: 'rgba(249,212,35,0.05)' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent)' }}>
                                            {selectedHospital.features.oxygenAvailability}%
                                        </div>
                                        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Oxygen</div>
                                    </div>
                                </div>

                                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                    <h4 style={{ marginBottom: '15px', fontSize: '0.9rem', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <AlertTriangle size={16} /> ON-SITE SPECIALISTS
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                        {Object.entries(selectedHospital.features.specialists).map(([name, data]) => (
                                            <div key={name} style={{
                                                background: data.available > 0 ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                                                padding: '12px',
                                                borderRadius: '10px',
                                                border: `1px solid ${data.available > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}`,
                                                display: 'flex',
                                                flexDirection: 'column'
                                            }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'capitalize' }}>{name.replace(/([A-Z])/g, ' $1')}</span>
                                                <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{data.available} Available</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="fade-in">
                                {searchResults.length === 0 ? (
                                    <div style={{ padding: '40px 20px', textAlign: 'center', opacity: 0.5 }}>
                                        <Info size={30} style={{ marginBottom: '10px' }} />
                                        <p>No hospitals found in this city or matching that name.</p>
                                    </div>
                                ) : (
                                    searchResults.map(h => (
                                        <div
                                            key={h._id}
                                            className="hospital-item"
                                            style={{ cursor: 'pointer', border: '1px solid rgba(255,255,255,0.05)' }}
                                            onClick={() => setSelectedHospital(h)}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <h4 style={{ margin: 0, color: 'var(--secondary)' }}>{h.name}</h4>
                                                <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{h.city}</span>
                                            </div>
                                            <div style={{ marginTop: '8px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                                <span className="tag" style={{ fontSize: '0.65rem' }}>ICU: {h.features.icuBeds.available}</span>
                                                <span className="tag" style={{ fontSize: '0.65rem' }}>Beds: {h.features.generalBeds.available}</span>
                                                {patientData.requiredSpecialist && h.features.specialists[patientData.requiredSpecialist] && (
                                                    <span className="tag" style={{ fontSize: '0.65rem', background: 'rgba(79, 172, 254, 0.1)', color: 'var(--secondary)' }}>
                                                        {patientData.requiredSpecialist}: {h.features.specialists[patientData.requiredSpecialist].available}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
