const fs = require('fs');

const cities = [
    { name: 'Kurnool', lat: 15.8281, lng: 78.0373 },
    { name: 'Anantapur', lat: 14.6819, lng: 77.6006 },
    { name: 'Chittoor', lat: 13.2172, lng: 79.1003 },
    { name: 'Kadapa', lat: 14.4674, lng: 78.8241 }
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
            date: pastDate.toISOString().split('T')[0], // Simplified format for viewing
            icuBedsAvailable: rand(0, icuTotal),
            generalBedsAvailable: rand(0, generalTotal),
            oxygenAvailability: rand(40, 100) // Percentage
        });
    }
    return data;
};

// Seeder logic extracted purely for generating the JSON file
const generateDataset = () => {
    let allHospitals = [];

    for (let c = 0; c < cities.length; c++) {
        const city = cities[c];

        for (let h = 1; h <= 6; h++) {
            const icuTotal = rand(10, 30);
            const generalTotal = rand(50, 150);

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

            const hospital = {
                name: `${city.name} General Hospital ${h}`,
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
            };

            allHospitals.push(hospital);
        }
    }

    // Write to a pretty-printed JSON file
    fs.writeFileSync('mock_dataset.json', JSON.stringify({
        totalHospitals: allHospitals.length,
        citiesCovered: cities.map(c => c.name),
        hospitals: allHospitals
    }, null, 4));

    console.log('Successfully exported dataset to mock_dataset.json');
};

generateDataset();
