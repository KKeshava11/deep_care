import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Activity, LogOut, Save, Bell, Check, X, Clock } from 'lucide-react';
import { io } from 'socket.io-client';

const API_BASE = 'http://localhost:5000/api';

export default function AdminDashboard() {
    const [allHospitals, setAllHospitals] = useState([]);
    const [selectedCity, setSelectedCity] = useState('');
    const [selectedHospitalId, setSelectedHospitalId] = useState('');
    const [password, setPassword] = useState('');
    const [hospitalAuth, setHospitalAuth] = useState(null);
    const [hospitalData, setHospitalData] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [reservations, setReservations] = useState([]);
    const [bookedPatients, setBookedPatients] = useState([]); // List of instant bookings
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        const fetchHospitals = async () => {
            try {
                const res = await axios.get(`${API_BASE}/hospitals`);
                setAllHospitals(res.data);
            } catch (err) {
                console.error("Failed to load hospitals");
            }
        };
        fetchHospitals();
    }, []);

    const cities = [...new Set(allHospitals.map(h => h.city))].sort();
    const filteredHospitals = allHospitals.filter(h => h.city === selectedCity).sort((a, b) => a.name.localeCompare(b.name));

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        if (!selectedHospitalId) {
            setError('Please select your hospital');
            return;
        }
        try {
            const res = await axios.post(`${API_BASE}/admin/login`, { hospitalId: selectedHospitalId, password: password.trim() });
            if (res.data.success) {
                setHospitalAuth(res.data);
                fetchData(res.data.hospitalId);

                // Initialize Socket on Login
                const newSocket = io('http://localhost:5000');
                newSocket.emit('joinHospital', res.data.hospitalId);

                newSocket.on('incomingReservation', (data) => {
                    setReservations(prev => [data, ...prev]);
                });

                newSocket.on('slotTaken', (data) => {
                    console.log(`Slot taken by ${data.ambulanceId}: ${data.specialistType}`);
                    // Add to booked patients list for notification
                    setBookedPatients(prev => [{
                        ...data,
                        timestamp: new Date().toLocaleTimeString()
                    }, ...prev]);
                    // Refresh data to show updated counts
                    fetchData(res.data.hospitalId);
                });

                setSocket(newSocket);
                setError('');
            }
        } catch (err) {
            if (err.response && err.response.status === 404) {
                setError('Hospital session expired. Please refresh the page and try again.');
            } else {
                setError('Invalid credentials for selected hospital. Try password@123');
            }
        }
    };

    const fetchData = async (id) => {
        try {
            const res = await axios.get(`${API_BASE}/admin/hospital/${id}`);
            setHospitalData(res.data.features);
        } catch (err) {
            console.error(err);
        }
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await axios.put(`${API_BASE}/admin/hospital/${hospitalAuth.hospitalId}`, hospitalData);
            setSaving(false);
            // alert could be cool here but glassmorphism design might want something subtle
        } catch (err) {
            setSaving(false);
            console.error(err);
        }
    };

    const handleSpecialistChange = (type, val) => {
        setHospitalData(prev => ({
            ...prev,
            specialists: {
                ...prev.specialists,
                [type]: {
                    ...prev.specialists[type],
                    available: Number(val)
                }
            }
        }));
    };

    const handleReservationResponse = (res, approved) => {
        if (!socket) return;

        socket.emit('reservationResponse', {
            ambulanceSocketId: res.socketId,
            approved,
            hospitalId: hospitalAuth.hospitalId,
            specialistType: res.specialistType
        });

        // Remove from list
        setReservations(prev => prev.filter(r => r.socketId !== res.socketId));

        // Refresh local data if approved
        if (approved) {
            setTimeout(() => fetchData(hospitalAuth.hospitalId), 500);
        }
    };

    if (!hospitalAuth) {
        return (
            <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
                <div className="glass-panel fade-in" style={{ maxWidth: '450px', width: '100%', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ background: 'var(--gradient-main)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto', boxShadow: '0 0 20px rgba(0,242,254,0.3)' }}>
                        <Activity size={40} color="#020617" />
                    </div>
                    <h1 className="heading" style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>Hospital Admin</h1>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Secure Resource Management Portal</p>

                    {error && <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '12px', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>{error}</div>}

                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                        <div style={{ textAlign: 'left' }}>
                            <label style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '5px', display: 'block', marginLeft: '5px' }}>Region / City</label>
                            <select
                                className="glass-input glass-select"
                                value={selectedCity}
                                onChange={(e) => { setSelectedCity(e.target.value); setSelectedHospitalId(''); }}
                                required
                            >
                                <option value="">Select Region...</option>
                                {cities.map(city => <option key={city} value={city}>{city}</option>)}
                            </select>
                        </div>

                        <div style={{ textAlign: 'left' }}>
                            <label style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '5px', display: 'block', marginLeft: '5px' }}>Hospital Facility</label>
                            <select
                                className="glass-input glass-select"
                                value={selectedHospitalId}
                                onChange={(e) => setSelectedHospitalId(e.target.value)}
                                disabled={!selectedCity}
                                required
                            >
                                <option value="">Select Hospital...</option>
                                {filteredHospitals.map(h => <option key={h._id} value={h._id}>{h.name}</option>)}
                            </select>
                        </div>

                        <div style={{ textAlign: 'left' }}>
                            <label style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '5px', display: 'block', marginLeft: '5px' }}>Access Key</label>
                            <input
                                className="glass-input"
                                type="password"
                                placeholder="Enter Access Password"
                                value={password} onChange={e => setPassword(e.target.value)}
                                required
                            />
                        </div>

                        <button className="btn-primary" type="submit" style={{ marginTop: '1rem', width: '100%', height: '50px' }}>
                            Gain Secure Access
                        </button>
                    </form>
                    <div style={{ marginTop: '2rem', padding: '15px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <p>Default access key for all facilities: <code style={{ color: 'var(--accent)', fontWeight: 'bold' }}>password@123</code></p>
                    </div>
                </div>
            </div>
        );
    }

    if (!hospitalData) return <div className="container" style={{ textAlign: 'center', marginTop: '20vh' }}><h2 className="heading">Initializing systems...</h2></div>;

    return (
        <div className="container fade-in">
            {/* INSTANT BOOKING NOTIFICATIONS */}
            {bookedPatients.length > 0 && (
                <div className="glass-panel fade-in" style={{
                    marginBottom: '2rem',
                    border: '1px solid var(--success)',
                    background: 'rgba(16, 185, 129, 0.1)',
                    boxShadow: '0 0 20px rgba(16, 185, 129, 0.2)',
                    zIndex: 100
                }}>
                    <h3 style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                        <Bell size={20} className="pulse" /> CRITICAL: Instant Slot Claimed ({bookedPatients.length})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {bookedPatients.map((book, i) => (
                            <div key={i} style={{ background: 'rgba(0,0,0,0.3)', padding: '12px 18px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                                <div>
                                    <span style={{ fontSize: '0.9rem', color: 'white' }}>
                                        Ambulance <strong style={{ color: 'var(--success)' }}>{book.ambulanceId}</strong> has instantly booked a
                                        <strong style={{ textTransform: 'capitalize', color: 'var(--primary)', marginLeft: '4px' }}>
                                            {book.specialistType.replace(/([A-Z])/g, ' $1')}
                                        </strong>
                                    </span>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '2px' }}>
                                        Condition: <span style={{ color: 'white' }}>{book.patientCondition}</span> | Facility Status: {book.remaining} Slots Remaining
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>{book.timestamp}</div>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                        <button
                            onClick={() => setBookedPatients([])}
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '6px', padding: '5px 12px', fontSize: '0.7rem', cursor: 'pointer' }}
                        >
                            Acknowledge & Clear
                        </button>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem', background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)' }}>
                <div>
                    <h1 className="heading" style={{ margin: 0, fontSize: '2.5rem' }}>{hospitalAuth.name}</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                        <span style={{ width: '8px', height: '8px', background: 'var(--success)', borderRadius: '50%', boxShadow: '0 0 10px var(--success)' }}></span>
                        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>Resource Control Center • Live Connection Established</p>
                    </div>
                </div>
                <button className="btn-primary" onClick={() => { socket?.disconnect(); setHospitalAuth(null); }} style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '10px 20px', fontSize: '0.9rem' }}>
                    <LogOut size={16} /> End Session
                </button>
            </div>

            {/* RESERVATION REQUEST BOX */}
            {reservations.length > 0 && (
                <div className="glass-panel fade-in" style={{ marginBottom: '2rem', border: '1px solid var(--accent)', background: 'rgba(249, 212, 35, 0.05)' }}>
                    <h3 style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                        <Bell size={20} className="pulse" /> Pending Slot Requests ({reservations.length})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {reservations.map((res, i) => (
                            <div key={i} style={{ background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div>
                                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'white' }}>
                                        Specialist: <span style={{ textTransform: 'capitalize', color: 'var(--primary)' }}>{res.specialistType.replace(/([A-Z])/g, ' $1')}</span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Clock size={14} /> Patient: <strong style={{ color: 'var(--danger)' }}>{res.patientCondition}</strong> | Amb: {res.ambulanceId}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button className="btn-success" onClick={() => handleReservationResponse(res, true)} style={{ padding: '8px 15px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <Check size={18} /> Approve
                                    </button>
                                    <button className="btn-primary" onClick={() => handleReservationResponse(res, false)} style={{ background: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger)', padding: '8px 15px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <X size={18} /> Deny
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <form onSubmit={handleUpdate} className="grid grid-cols-1-2">
                {/* METRICS PANEL */}
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', border: '1px solid var(--border)' }}>
                    <h3 style={{ color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                        <Activity size={20} /> Capacity Overview
                    </h3>

                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <label style={{ fontWeight: 600 }}>ICU Beds Available</label>
                                    <span style={{ color: 'var(--text-muted)' }}>Total: {hospitalData.icuBeds.total}</span>
                                </div>
                                <input className="glass-input" type="number" min="0" max={hospitalData.icuBeds.total}
                                    value={hospitalData.icuBeds.available}
                                    onChange={e => setHospitalData({
                                        ...hospitalData,
                                        icuBeds: { ...hospitalData.icuBeds, available: Number(e.target.value) }
                                    })}
                                    style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--success)' }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <label style={{ fontWeight: 600 }}>General Beds Available</label>
                                    <span style={{ color: 'var(--text-muted)' }}>Total: {hospitalData.generalBeds.total}</span>
                                </div>
                                <input className="glass-input" type="number" min="0" max={hospitalData.generalBeds.total}
                                    value={hospitalData.generalBeds.available}
                                    onChange={e => setHospitalData({
                                        ...hospitalData,
                                        generalBeds: { ...hospitalData.generalBeds, available: Number(e.target.value) }
                                    })}
                                    style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--secondary)' }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <label style={{ fontWeight: 600 }}>Oxygen Reserves (%)</label>
                                    <span style={{ color: 'var(--accent)' }}>Critical Limit: 30%</span>
                                </div>
                                <input className="glass-input" type="number" min="0" max="100"
                                    value={hospitalData.oxygenAvailability}
                                    onChange={e => setHospitalData({
                                        ...hospitalData,
                                        oxygenAvailability: Number(e.target.value)
                                    })}
                                    style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent)' }}
                                />
                            </div>
                        </div>
                    </div>

                    <button type="submit" className="btn-primary" disabled={saving} style={{ height: '50px', fontSize: '1.1rem' }}>
                        {saving ? 'Synchronizing Servers...' : <><Save size={20} /> Push Updates Live</>}
                    </button>
                </div>

                {/* SPECIALISTS PANEL */}
                <div className="glass-panel">
                    <h3 style={{ color: 'var(--secondary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>On-Duty Specialists</h3>
                    <div className="grid grid-cols-2">
                        {Object.keys(hospitalData.specialists).map(spec => (
                            <div key={spec} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                <label style={{ textTransform: 'capitalize' }}>{spec.replace(/([A-Z])/g, ' $1').trim()}</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{hospitalData.specialists[spec].available}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>/ {hospitalData.specialists[spec].total}</span>
                                    <input style={{ marginLeft: 'auto', width: '80px' }} className="glass-input" type="number" min="0" max={hospitalData.specialists[spec].total}
                                        value={hospitalData.specialists[spec].available}
                                        onChange={e => handleSpecialistChange(spec, e.target.value)}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </form>
        </div>
    );
}
