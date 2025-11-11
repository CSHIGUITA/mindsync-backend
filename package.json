const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Información básica del usuario
  name: {
    type: String,
    required: [true, 'El nombre es requerido'],
    trim: true,
    maxlength: [100, 'El nombre no puede exceder 100 caracteres']
  },
  
  email: {
    type: String,
    required: [true, 'El email es requerido'],
    unique: true,
    lowercase: true,
    trim: true,
    // CORRECCIÓN: Expresión regular más permisiva para emails
    match: [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Por favor ingresa un email válido']
  },
  
  password: {
    type: String,
    required: [true, 'La contraseña es requerida'],
    // CORRECCIÓN: Alineado con auth.js (6 caracteres mínimo)
    minlength: [6, 'La contraseña debe tener al menos 6 caracteres']
  },
  
  // Información demográfica
  age: {
    type: Number,
    min: [13, 'Debes ser mayor de 13 años'],
    max: [120, 'La edad no puede exceder 120 años']
  },
  
  gender: {
    type: String,
    enum: ['male', 'female', 'non-binary', 'prefer-not-to-say'],
    default: 'prefer-not-to-say'
  },
  
  timezone: {
    type: String,
    default: 'America/Bogota'
  },
  
  // Plan de suscripción
  subscriptionPlan: {
    type: String,
    enum: ['free', 'basic', 'premium'],
    default: 'free'
  },
  
  // NUEVO: Campo de seguridad para login attempts
  security: {
    loginAttempts: {
      type: Number,
      default: 0
    },
    lockUntil: {
      type: Date
    },
    lastLogin: {
      type: Date
    },
    isLocked: {
      type: Boolean,
      default: false
    }
  },
  
  // Preferencias del usuario
  preferences: {
    therapyStyle: {
      type: String,
      enum: ['cognitive', 'behavioral', 'humanistic', 'integrated'],
      default: 'cognitive'
    },
    
    communicationStyle: {
      type: String,
      enum: ['supportive', 'direct', 'humorous', 'mindful'],
      default: 'supportive'
    },
    
    language: {
      type: String,
      default: 'es'
    },
    
    crisisSupport: {
      type: Boolean,
      default: true
    },
    
    notificationSettings: {
      pushEnabled: {
        type: Boolean,
        default: true
      },
      emailEnabled: {
        type: Boolean,
        default: true
      },
      frequency: {
        type: String,
        enum: ['immediate', 'daily', 'weekly', 'monthly'],
        default: 'daily'
      }
    }
  },
  
  // Estadísticas de uso
  stats: {
    totalSessions: {
      type: Number,
      default: 0
    },
    totalMessages: {
      type: Number,
      default: 0
    },
    sessionsThisWeek: {
      type: Number,
      default: 0
    },
    lastSessionDate: {
      type: Date
    },
    lastActivity: {
      type: Date
    },
    streakDays: {
      type: Number,
      default: 0
    },
    moodTrends: [{
      date: {
        type: Date,
        required: true
      },
      mood: {
        type: Number,
        min: 1,
        max: 10
      },
      context: String
    }],
    goalsCompleted: {
      type: Number,
      default: 0
    }
  },
  
  // Gestión de sesiones
  lastLogin: {
    type: Date,
    default: Date.now
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Correos de verificación y recuperación
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  
  emailVerificationToken: {
    type: String
  },
  
  resetPasswordToken: {
    type: String
  },
  
  resetPasswordExpires: {
    type: Date
  }
}, {
  timestamps: true, // Crea createdAt y updatedAt automáticamente
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.emailVerificationToken;
      delete ret.resetPasswordToken;
      delete ret.__v;
      return ret;
    }
  },
  toObject: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.emailVerificationToken;
      delete ret.resetPasswordToken;
      delete ret.__v;
      return ret;
    }
  }
});

// Índices para optimizar consultas
userSchema.index({ email: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ lastLogin: -1 });
userSchema.index({ 'security.lockUntil': 1 });

// Virtual para obtener la edad de la cuenta
userSchema.virtual('accountAge').get(function() {
  return Math.floor((new Date() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Virtual para obtener el estado de la suscripción
userSchema.virtual('subscriptionStatus').get(function() {
  const now = new Date();
  const endDate = this.subscriptionEndDate;
  
  if (!endDate) return 'free';
  if (endDate < now) return 'expired';
  return 'active';
});

// 🔧 NUEVOS MÉTODOS PARA AUTENTICACIÓN

// Método para comparar contraseñas
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Método para incrementar intentos de login
userSchema.methods.incLoginAttempts = async function() {
  // Si ya está bloqueado
  if (this.security.lockUntil && this.security.lockUntil < Date.now()) {
    this.security.loginAttempts = 1;
  } else {
    this.security.loginAttempts += 1;
  }
  
  // Bloquear después de 5 intentos fallidos
  if (this.security.loginAttempts >= 5 && !this.security.lockUntil) {
    this.security.lockUntil = Date.now() + (2 * 60 * 60 * 1000); // 2 horas
  }
  
  return this.save();
};

// Método para resetear intentos de login
userSchema.methods.resetLoginAttempts = async function() {
  this.security.loginAttempts = 0;
  this.security.lockUntil = undefined;
  this.security.isLocked = false;
  return this.save();
};

// Método para verificar si el usuario puede hacer más sesiones
userSchema.methods.canStartSession = function() {
  const limits = {
    free: 5,     // 5 sesiones por semana
    basic: 20,   // 20 sesiones por semana  
    premium: -1  // Ilimitado
  };
  
  const limit = limits[this.subscriptionPlan];
  return limit === -1 || this.stats.sessionsThisWeek < limit;
};

// Método para actualizar estadísticas de sesión
userSchema.methods.updateSessionStats = function() {
  this.stats.totalSessions += 1;
  this.stats.sessionsThisWeek += 1;
  this.stats.lastSessionDate = new Date();
  
  // Actualizar racha si fue hoy
  const lastSession = this.stats.lastSessionDate;
  const daysSinceLastSession = Math.floor((new Date() - lastSession) / (1000 * 60 * 60 * 24));
  
  if (daysSinceLastSession === 1) {
    this.stats.streakDays += 1;
  } else if (daysSinceLastSession > 1) {
    this.stats.streakDays = 1;
  }
  
  return this.save();
};

// Método para agregar entrada de estado de ánimo
userSchema.methods.addMoodEntry = function(mood, context) {
  this.stats.moodTrends.push({
    date: new Date(),
    mood: mood,
    context: context
  });
  
  // Mantener solo los últimos 100 registros
  if (this.stats.moodTrends.length > 100) {
    this.stats.moodTrends = this.stats.moodTrends.slice(-100);
  }
  
  return this.save();
};

// Middleware para encriptar contraseñas antes de guardar
userSchema.pre('save', async function(next) {
  // Solo encriptar si la contraseña se modificó
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Middleware para sanitizar datos antes de guardar
userSchema.pre('save', function(next) {
  // Convertir nombre a título
  if (this.isModified('name')) {
    this.name = this.name.trim().replace(/\b\w/g, l => l.toUpperCase());
  }
  
  // Convertir email a minúsculas
  if (this.isModified('email')) {
    this.email = this.email.toLowerCase().trim();
  }
  
  // Validar que si age está presente, sea un número válido
  if (this.isModified('age') && this.age) {
    this.age = parseInt(this.age);
  }
  
  next();
});

module.exports = mongoose.model('User', userSchema);
