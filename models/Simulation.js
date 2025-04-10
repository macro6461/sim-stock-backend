const mongoose = require('mongoose');

// Saved Sim Schema
const simulationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    data: {type: Object, required: true},
    createdAt: { type: Date, default: Date.now },
    capital: {type: mongoose.Schema.Types.Number, required: true}
});

module.exports = mongoose.model('Simulation', simulationSchema);