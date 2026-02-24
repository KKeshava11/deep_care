const Hospital = require('./models/Hospital');

// Haversine formula to get distance in km between two lat/lng points
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Predict missing values using basic ML logic (moving average of past 30 days)
function predictMissingValue(historicalData, key) {
    if (!historicalData || historicalData.length === 0) return 0;
    let sum = 0;
    let count = 0;
    historicalData.forEach(day => {
        if (day[key] !== undefined) {
            sum += day[key];
            count++;
        }
    });
    return count > 0 ? Math.round(sum / count) : 0;
}

const { quantumOptimize } = require('./quantum_engine');

// The core recommendation engine logic
async function recommendHospitals(patientRequest) {
    const { condition, requiredSpecialist, needsICU, needsOxygen, location } = patientRequest;

    // Fetch all hospitals from the database
    let hospitals = await Hospital.find().lean();
    let rankedHospitals = [];

    for (let hospital of hospitals) {
        // ... (existing filter logic)
        if (requiredSpecialist) {
            const spec = hospital.features.specialists[requiredSpecialist];
            if (!spec || spec.available <= 0) continue;
        }

        let currentIcuAvailable = hospital.features.icuBeds.available ?? predictMissingValue(hospital.historicalData, 'icuBedsAvailable');
        if (needsICU && currentIcuAvailable <= 0) continue;

        let currentGenBedsAvailable = hospital.features.generalBeds.available ?? predictMissingValue(hospital.historicalData, 'generalBedsAvailable');
        let currentO2 = hospital.features.oxygenAvailability ?? predictMissingValue(hospital.historicalData, 'oxygenAvailability');
        if (needsOxygen && currentO2 < 20) continue;

        let distance = getDistance(location.lat, location.lng, hospital.location.lat, hospital.location.lng);

        // Standard Heuristic Scoring (used as seed for Quantum Engine)
        let score = (1000 - (distance * 10)) + (currentIcuAvailable * 10) + currentGenBedsAvailable + (currentO2 * 2);

        rankedHospitals.push({
            hospitalId: hospital._id,
            name: hospital.name,
            city: hospital.city,
            distanceStr: distance.toFixed(2) + ' km',
            distanceVal: distance,
            icuAvailable: currentIcuAvailable,
            generalBedsAvailable: currentGenBedsAvailable,
            oxygenAvailability: currentO2,
            score: score,
            lat: hospital.location.lat,
            lng: hospital.location.lng,
            specialists: hospital.features.specialists
        });
    }

    // Phase 1: Heuristic Ranking
    rankedHospitals.sort((a, b) => b.score - a.score);

    // Phase 2: Quantum-Inspired Refinement (Optimal Shortest Time Path)
    const quantumRanking = quantumOptimize(rankedHospitals.slice(0, 15), patientRequest);

    // Merge and Flag
    const finalResults = quantumRanking.map(h => ({ ...h, quantumOptimized: true }));

    return finalResults.slice(0, 10);
}

module.exports = { recommendHospitals, getDistance };
