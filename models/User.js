const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    lowercase: true
  },
  password: { 
    type: String, 
    required: true,
    minlength: 6
  },
  isFirstLogin: { 
    type: Boolean, 
    default: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  // Estadísticas del usuario
  totalSessions: { 
    type: Number, 
    default: 0 
  },
  totalMessages: { 
    type: Number, 
    default: 0 
  },
  lastActivity: { 
    type: Date, 
    default: Date.now 
  },
  moodAverage: { 
    type: Number, 
    default: 0 
  },
  daysTracked: { 
    type: Number, 
    default: 0 
  }
});

// Exportar el modelo User
module.exports = mongoose.model('User', userSchema);
