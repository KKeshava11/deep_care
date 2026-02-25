import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Stethoscope, Ambulance, Activity } from 'lucide-react';
import AdminDashboard from './AdminDashboard';
import AmbulanceView from './AmbulanceView';

function NavTabs() {
    const location = useLocation();
    return (
        <nav>
            <Link to="/" className="nav-logo">
                <Activity color="var(--secondary)" /> Deep<span>Care</span>
            </Link>
            <div className="nav-links">
                <Link to="/ambulance" className={location.pathname === '/ambulance' ? 'active' : ''}>
                    <Ambulance size={18} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
                    Ambulance Portal
                </Link>
                <Link to="/admin" className={location.pathname === '/admin' ? 'active' : ''}>
                    <Stethoscope size={18} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
                    Hospital Admin
                </Link>
            </div>
        </nav>
    );
}

function Landing() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', textAlign: 'center' }}>
            <h1 className="heading" style={{ fontSize: '4rem', marginBottom: '1rem' }}>AI Emergency Routing</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', maxWidth: '600px', marginBottom: '2rem' }}>
                Real-time hospital capacity tracking and intelligent dynamic rerouting for emergency vehicles.
            </p>
            <div style={{ display: 'flex', gap: '20px' }}>
                <Link to="/ambulance" className="btn-primary" style={{ textDecoration: 'none', padding: '16px 32px' }}>
                    <Ambulance /> Start Ambulance
                </Link>
                <Link to="/admin" className="btn-success" style={{ textDecoration: 'none', padding: '16px 32px' }}>
                    <Stethoscope /> Admin Login
                </Link>
            </div>
        </div>
    )
}

import GoogleMapsView from './GoogleMapsView';

function App() {
    return (
        <Router>
            <NavTabs />
            <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/ambulance" element={<AmbulanceView />} />
                <Route path="/navigation" element={<GoogleMapsView />} />
            </Routes>
        </Router>
    );
}

export default App;
