const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');
const Hospital = require('./models/Hospital');
const { recommendHospitals } = require('./ml_engine');
const { seedDatabase } = require('./seed');
const { MongoMemoryServer } = require('mongodb-memory-server');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

// Start In-Memory MongoDB Server and Seed Database
async function startServer() {
    console.log('Spinning up in-memory MongoDB cluster... this might take several seconds on first run');
    const mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();

    await mongoose.connect(uri);
    console.log('In-Memory MongoDB Connected via Express! Seed engine engaged...');

    // Seed the database with fake hospitals data
    await seedDatabase();

    // Start Server
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

startServer().catch(err => console.error(err));

// Websocket logic
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Join a room for a specific hospital (used by admins)
    socket.on('joinHospital', (hospitalId) => {
        socket.join(hospitalId);
        console.log(`Socket ${socket.id} joined hospital room: ${hospitalId}`);
    });

    // Ambulance sends a reservation request
    socket.on('reservationRequest', (data) => {
        const { hospitalId, specialistType, patientCondition, ambulanceId } = data;
        console.log(`Reservation request for ${hospitalId} specialist ${specialistType}`);

        // Forward request to the specific hospital's admin room
        io.to(hospitalId).emit('incomingReservation', {
            ...data,
            socketId: socket.id // Store ambulance socket ID to reply back
        });
    });

    // Admin responds to a reservation request
    socket.on('reservationResponse', async (data) => {
        const { ambulanceSocketId, approved, hospitalId, specialistType } = data;

        if (approved) {
            try {
                // Atomic decrement of specialist slot
                await Hospital.findByIdAndUpdate(hospitalId, {
                    $inc: { [`features.specialists.${specialistType}.available`]: -1 },
                    $set: { lastUpdated: Date.now() }
                });

                // Broadcast update so everyone sees the slot change
                io.emit('hospitalUpdate', { hospitalId });
            } catch (err) {
                console.error("Booking DB Error:", err);
            }
        }

        // Send response back to the specific ambulance
        io.to(ambulanceSocketId).emit('bookingResult', {
            approved,
            hospitalId,
            message: approved ? 'Slot Successfully Booked!' : 'Slot Request Denied by Hospital Admin.'
        });
    });

    // Instant Booking (No admin approval required)
    socket.on('instantBooking', async (data) => {
        const { hospitalId, specialistType, ambulanceId, patientCondition } = data;
        console.log(`Instant booking for ${hospitalId} specialist ${specialistType}`);

        try {
            // Atomic decrement with safety check (ensure available > 0)
            const updatedHosp = await Hospital.findOneAndUpdate(
                { _id: hospitalId, [`features.specialists.${specialistType}.available`]: { $gt: 0 } },
                {
                    $inc: { [`features.specialists.${specialistType}.available`]: -1 },
                    $set: { lastUpdated: Date.now() }
                },
                { new: true }
            );

            if (!updatedHosp) {
                return socket.emit('bookingResult', {
                    approved: false,
                    hospitalId,
                    message: `Booking failed: No ${specialistType.replace(/([A-Z])/g, ' $1')} slots available at this moment.`
                });
            }

            // Broadcast update so everyone sees the slot change
            io.emit('hospitalUpdate', { hospitalId });

            // Notify hospital admin that a slot was taken
            io.to(hospitalId).emit('slotTaken', {
                ambulanceId,
                specialistType,
                patientCondition,
                remaining: updatedHosp.features.specialists[specialistType].available
            });

            // Send confirmation back to the ambulance
            socket.emit('bookingResult', {
                approved: true,
                hospitalId,
                message: 'Slot Booked Automatically! You are clear for dispatch.'
            });
        } catch (err) {
            console.error("Instant Booking Error:", err);
            socket.emit('bookingResult', {
                approved: false,
                hospitalId,
                message: 'Error processing booking. Please try again.'
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Health Check / Root Route
app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: white; min-height: 100vh;">
            <h1 style="color: #38bdf8;">DeepCare Backend API</h1>
            <p>Status: <span style="color: #4ade80;">Active & Running</span></p>
            <p style="opacity: 0.6;">Specialized Hospital Routing & Real-time Resource Management Engine</p>
            <div style="margin-top: 20px; padding: 20px; background: rgba(255,255,255,0.05); display: inline-block; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1);">
                <code style="color: #fbbf24;">Socket.io Server: Active</code><br/>
                <code style="color: #fbbf24;">REST API Base: /api</code>
            </div>
        </div>
    `);
});

// REST API Endpoints

// 1. Admin Login
app.post('/api/admin/login', async (req, res) => {
    const { hospitalId, password } = req.body;
    console.log("LOGIN ATTEMPT - ID:", hospitalId, "PWD:", password);
    try {
        const hospital = await Hospital.findById(hospitalId);
        if (!hospital) {
            console.log("LOGIN FAILED - Hospital ID not found in current session");
            return res.status(404).json({ success: false, message: 'Hospital not found' });
        }

        console.log("HOSPITAL FOUND:", hospital.name);

        // Check for the user-specified demo password or the one in DB
        if (password.trim() === 'password@123' || password.trim() === hospital.adminLogin.password) {
            console.log("LOGIN SUCCESS");
            res.json({ success: true, hospitalId: hospital._id, name: hospital.name });
        } else {
            console.log("LOGIN FAILED - Password Mismatch");
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (err) {
        console.error("LOGIN DB ERROR:", err);
        res.status(500).json({ error: 'Database error' });
    }
});

// 2. Get Single Hospital Data (For Admin Dashboard)
app.get('/api/admin/hospital/:id', async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.params.id);
        res.json(hospital);
    } catch (err) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// 3. Admin Update Hospital Real-time Data
app.put('/api/admin/hospital/:id', async (req, res) => {
    try {
        const { icuBeds, generalBeds, oxygenAvailability, specialists } = req.body;

        // We update the real-time features
        const updated = await Hospital.findByIdAndUpdate(req.params.id, {
            $set: {
                'features.icuBeds.available': icuBeds.available,
                'features.generalBeds.available': generalBeds.available,
                'features.oxygenAvailability': oxygenAvailability,
                'features.specialists': specialists,
                lastUpdated: Date.now()
            }
        }, { new: true });

        // Broadcast the update to all connected ambulance clients so they can reroute if needed
        io.emit('hospitalUpdate', { hospitalId: updated._id });

        res.json({ success: true, updated });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update' });
    }
});

// 4. Ambulance GET Recommendation
app.post('/api/ambulance/recommend', async (req, res) => {
    try {
        console.log('Recommendation Request Received:', req.body);
        const recommendations = await recommendHospitals(req.body);
        console.log(`Found ${recommendations.length} recommendations`);
        res.json(recommendations);
    } catch (err) {
        console.error('Recommendation Error:', err);
        res.status(500).json({ error: 'Recommendation Engine Error' });
    }
});

// 5. Search Hospitals
app.get('/api/hospitals', async (req, res) => {
    try {
        const hospitals = await Hospital.find();
        res.json(hospitals);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch hospitals' });
    }
});


