const mongoose = require('mongoose');
const Hospital = require('./models/Hospital');
require('dotenv').config();


const cities = [
    { name: 'Kurnool', lat: 15.8281, lng: 78.0373 },
    { name: 'Anantapur', lat: 14.6819, lng: 77.6006 },
    { name: 'Chittoor', lat: 13.2172, lng: 79.1003 },
    { name: 'Kadapa', lat: 14.4674, lng: 78.8241 }
];

const hospitalPrefixes = [
    'Apollo', 'Lifeline', 'St. Mary\'s', 'Lotus', 'Heritage', 'Seven Hills',
    'Metro', 'Care', 'HealthCity', 'MedPlus', 'Global', 'Sunshine',
    'Pinnacle', 'Vibrant', 'Zenith', 'Rainbow', 'KIMS', 'Medicover'
];

const hospitalTypes = [
    'General Hospital', 'Multi-Speciality Center', 'Healthcare Institute',
    'Medical Center', 'Super Speciality Hospital', 'Medicare'
];

const specialistTypes = ['cardiologist', 'neurologist', 'orthopedist', 'pediatrician', 'generalSurgeon'];

// Utility to generate a random number within a range (inclusive)
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Function to generate 30 days of historical data
const generateHistoricalData = (icuTotal, generalTotal) => {
    const data = [];
    let today = new Date();
    for (let i = 1; i <= 30; i++) {
        const pastDate = new Date(today);
        pastDate.setDate(today.getDate() - i);

        // Some random historical availability
        data.push({
            date: pastDate,
            icuBedsAvailable: rand(0, icuTotal),
            generalBedsAvailable: rand(0, generalTotal),
            oxygenAvailability: rand(40, 100) // Percentage
        });
    }
    return data;
};

// Seeder logic
const seedDatabase = async () => {
    try {
        await Hospital.deleteMany(); // Clear existing
        console.log('Cleared existing hospitals');

        let allHospitals = [];
        let usedNames = new Set();

        for (let c = 0; c < cities.length; c++) {
            const city = cities[c];

            for (let h = 1; h <= 6; h++) {
                const icuTotal = rand(10, 30);
                const generalTotal = rand(50, 150);

                // Generate a unique realistic name
                let finalName = '';
                while (true) {
                    const prefix = hospitalPrefixes[rand(0, hospitalPrefixes.length - 1)];
                    const middle = Math.random() > 0.5 ? city.name : '';
                    const type = hospitalTypes[rand(0, hospitalTypes.length - 1)];
                    finalName = `${prefix} ${middle} ${type}`.replace(/\s+/g, ' ').trim();
                    if (!usedNames.has(finalName)) {
                        usedNames.add(finalName);
                        break;
                    }
                }

                // Generate specialists capacity
                let specialists = {};
                specialistTypes.forEach(type => {
                    const sTotal = rand(1, 4);
                    specialists[type] = {
                        total: sTotal,
                        available: rand(0, sTotal)
                    };
                });

                // Add a small random offset to latitude/longitude to distribute them in the city
                const locOffsetLat = (Math.random() - 0.5) * 0.05;
                const locOffsetLng = (Math.random() - 0.5) * 0.05;

                const hospital = new Hospital({
                    name: finalName,
                    city: city.name,
                    adminLogin: { username: `admin_${city.name.toLowerCase()}${h}`, password: 'password123' },
                    location: {
                        lat: city.lat + locOffsetLat,
                        lng: city.lng + locOffsetLng,
                    },
                    features: {
                        icuBeds: { total: icuTotal, available: rand(0, icuTotal) },
                        generalBeds: { total: generalTotal, available: rand(0, generalTotal) },
                        oxygenAvailability: rand(50, 100),
                        specialists: specialists
                    },
                    historicalData: generateHistoricalData(icuTotal, generalTotal)
                });

                allHospitals.push(hospital);
            }
        }

        await Hospital.insertMany(allHospitals);
        console.log(`Successfully seeded ${allHospitals.length} hospitals!`);


    } catch (error) {
        console.error('Error seeding data:', error);

    }
};

module.exports = { seedDatabase };
