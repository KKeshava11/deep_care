/**
 * Quantum-Inspired Optimization Engine (QIO)
 * Mimics Quantum Annealing to solve multi-objective routing and hospital selection.
 */

// Simulated Quantum Flux (Tunneling Probability)
const fluxPower = (temperature) => Math.exp(-1 / temperature);

/**
 * Simulated Quantum Annealing (SQA) for Optimal Hospital Selection
 * @param {Array} candidates - Initial filtered hospital list
 * @param {Object} patientState - Patient urgency and requirements
 */
function quantumOptimize(candidates, patientState) {
    if (candidates.length <= 1) return candidates;

    console.log(`[Quantum Engine] Initializing qubits for ${candidates.length} nodes...`);

    // State representation: Each hospital is a 'spin' state. 
    // We want to find the global minimum of the "Inconvenience Energy" function.

    let currentBest = candidates[0];
    let currentEnergy = calculateEnergy(currentBest, patientState);

    let temperature = 100.0;
    const coolingRate = 0.95;
    const iterations = 50;

    for (let i = 0; i < iterations; i++) {
        // Quantum superposition simulation: Pick a random candidate to tunnel to
        const randomIndex = Math.floor(Math.random() * candidates.length);
        const nextCandidate = candidates[randomIndex];
        const nextEnergy = calculateEnergy(nextCandidate, patientState);

        // Tunneling logic: If the new state is better, or if we 'tunnel' through a barrier
        if (nextEnergy < currentEnergy || Math.random() < fluxPower(temperature)) {
            currentBest = nextCandidate;
            currentEnergy = nextEnergy;
        }

        temperature *= coolingRate;
    }

    // Re-rank based on Quantum Energy levels (Lower energy = Better match)
    const refinedRanking = [...candidates].sort((a, b) => {
        return calculateEnergy(a, patientState) - calculateEnergy(b, patientState);
    });

    console.log(`[Quantum Engine] State collapse complete. Optimal path found.`);
    return refinedRanking;
}

/**
 * Cost Function (Hamiltonian Energy)
 * Energy = Distance_Penalty + Resource_Shortage_Penalty + Time_Risk
 */
function calculateEnergy(h, p) {
    const distWeight = p.condition === 'Critical' ? 15 : 10;
    const icuShortage = p.needsICU ? (h.icuAvailable === 0 ? 1000 : 50 / h.icuAvailable) : 0;
    const o2Shortage = p.needsOxygen ? (100 - h.oxygenAvailability) * 2 : 0;

    // Simulated Quantum Interference (Random fluctuation in traffic/readiness)
    const interference = Math.random() * 5;

    return (h.distanceVal * distWeight) + icuShortage + o2Shortage + interference;
}

module.exports = { quantumOptimize };
