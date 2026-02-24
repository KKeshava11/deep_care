const mongoose = require('mongoose');

const specialistSchema = new mongoose.Schema({
  available: { type: Number, default: 0 },
  total: { type: Number, default: 0 }
}, { _id: false });

const dayRecordSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  icuBedsAvailable: { type: Number, required: true },
  generalBedsAvailable: { type: Number, required: true },
  oxygenAvailability: { type: Number, required: true }, // percentage 0-100
}, { _id: false });

const hospitalSchema = new mongoose.Schema({
  name: { type: String, required: true },
  city: { type: String, required: true },
  adminLogin: {
    username: { type: String, required: true },
    password: { type: String, required: true } // In a real app we'd hash this, keeping it simple here
  },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  features: {
    icuBeds: {
      total: { type: Number, default: 0 },
      available: { type: Number, default: 0 }
    },
    generalBeds: {
      total: { type: Number, default: 0 },
      available: { type: Number, default: 0 }
    },
    oxygenAvailability: { type: Number, default: 100 }, // Current percentage 0-100
    specialists: {
      cardiologist: specialistSchema,
      neurologist: specialistSchema,
      orthopedist: specialistSchema,
      pediatrician: specialistSchema,
      generalSurgeon: specialistSchema
    }
  },
  historicalData: [dayRecordSchema], // Last 30 days
  lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Hospital', hospitalSchema);
