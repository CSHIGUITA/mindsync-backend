const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../logger');

const router = express.Router();

// ✅ MIDDLEWARE DE AUTENTICACIÓN MEJORADO (igual que chat.js)
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      logger.warn('Token no proporcionado en progress', { path: req.path, ip: req.ip });
      return res.status(401).json({ error: 'Token de acceso requerido' });
    }

    // Verificar y decodificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verificar que el usuario existe
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      logger.warn('Usuario no encontrado en BD (progress)', { userId: decoded.userId, ip: req.ip });
      return res.status(403).json({ error: 'Usuario no encontrado' });
    }

    // Adjuntar usuario a la request
    req.user = user;
    req.userId = decoded.userId;
    
    next();
  } catch (error) {
    logger.error('Error en autenticación (progress)', { 
      error: error.message, 
      token: req.headers.authorization?.substring(0, 50) + '...',
      ip: req.ip 
    });
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Token inválido' });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Token expirado' });
    }
    
    return res.status(403).json({ error: 'Error de autenticación' });
  }
};

// ✅ OBTENER PROGRESO DEL USUARIO
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    
    logger.info('Obteniendo progreso del usuario', { userId });
    
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const progress = {
      totalSessions: user.totalSessions,
      totalMessages: user.totalMessages,
      lastActivity: user.lastActivity,
      moodAverage: user.moodAverage,
      daysTracked: user.daysTracked,
      createdAt: user.createdAt,
      streak: calculateStreak(user.lastActivity)
    };

    logger.info('Progreso obtenido exitosamente', { 
      userId, 
      sessions: progress.totalSessions,
      messages: progress.totalMessages 
    });

    res.json({ progress });

  } catch (error) {
    logger.error('Error obteniendo progreso', { 
      userId: req.userId, 
      error: error.message,
      stack: error.stack 
    });
    
    res.status(500).json({ 
      error: 'Error interno del servidor',
      message: 'No se pudo obtener el progreso'
    });
  }
});

// ✅ GUARDAR MOOD (ESTADO DE ÁNIMO)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { mood, note = '' } = req.body;
    
    // Validación de mood
    if (!mood || mood < 1 || mood > 10) {
      return res.status(400).json({ 
        error: 'El mood debe ser un número entre 1 y 10' 
      });
    }

    logger.info('Guardando mood del usuario', { 
      userId, 
      mood, 
      hasNote: note.length > 0 
    });

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Calcular nuevo promedio de mood
    const currentDays = user.daysTracked || 0;
    const currentAverage = user.moodAverage || 0;
    
    const newDaysTracked = currentDays + 1;
    const newMoodAverage = ((currentAverage * currentDays) + mood) / newDaysTracked;

    // Actualizar usuario
    await User.updateOne(
      { _id: userId },
      {
        $set: { 
          moodAverage: Math.round(newMoodAverage * 10) / 10, // Redondear a 1 decimal
          lastActivity: new Date()
        },
        $inc: { daysTracked: 1 }
      }
    );

    const updatedUser = await User.findById(userId);
    
    const moodEntry = {
      mood: parseInt(mood),
      note: note.trim(),
      timestamp: new Date(),
      averageMood: updatedUser.moodAverage,
      daysTracked: updatedUser.daysTracked
    };

    logger.info('Mood guardado exitosamente', { 
      userId, 
      mood: mood,
      newAverage: updatedUser.moodAverage,
      daysTracked: updatedUser.daysTracked 
    });

    res.json({ 
      message: 'Mood guardado exitosamente',
      moodEntry 
    });

  } catch (error) {
    logger.error('Error guardando mood', { 
      userId: req.userId, 
      error: error.message,
      stack: error.stack 
    });
    
    res.status(500).json({ 
      error: 'Error interno del servidor',
      message: 'No se pudo guardar el mood'
    });
  }
});

// ✅ OBTENER HISTORIAL DE MOODS (ÚLTIMOS 30 DÍAS)
router.get('/mood-history', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    
    logger.info('Obteniendo historial de moods', { userId });
    
    // Simular historial basado en datos del usuario
    // En un sistema real, esto vendría de una colección separada
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Generar historial simulado basado en datos reales
    const history = [];
    const days = user.daysTracked || 0;
    
    if (days > 0) {
      // Simular datos históricos basados en el promedio actual
      const baseMood = user.moodAverage || 5;
      const today = new Date();
      
      for (let i = 0; i < Math.min(days, 30); i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        
        // Variar el mood alrededor del promedio
        const variation = (Math.random() - 0.5) * 4; // Variación de ±2
        const simulatedMood = Math.max(1, Math.min(10, Math.round(baseMood + variation)));
        
        history.push({
          mood: simulatedMood,
          note: i === 0 ? 'Entrada reciente' : '',
          timestamp: date.toISOString(),
          date: date.toLocaleDateString('es-ES')
        });
      }
    }

    logger.info('Historial de moods obtenido', { 
      userId, 
      entries: history.length 
    });

    res.json({ 
      history,
      summary: {
        totalEntries: history.length,
        averageMood: user.moodAverage,
        daysTracked: user.daysTracked,
        trend: calculateTrend(history)
      }
    });

  } catch (error) {
    logger.error('Error obteniendo historial de moods', { 
      userId: req.userId, 
      error: error.message,
      stack: error.stack 
    });
    
    res.status(500).json({ 
      error: 'Error interno del servidor',
      message: 'No se pudo obtener el historial'
    });
  }
});

// ✅ OBTENER RESUMEN GENERAL DEL PROGRESO
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    
    logger.info('Obteniendo overview de progreso', { userId });
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const overview = {
      // Estadísticas generales
      totalSessions: user.totalSessions || 0,
      totalMessages: user.totalMessages || 0,
      daysTracked: user.daysTracked || 0,
      moodAverage: user.moodAverage || 0,
      
      // Fechas importantes
      memberSince: user.createdAt,
      lastActivity: user.lastActivity,
      
      // Cálculos adicionales
      streak: calculateStreak(user.lastActivity),
      engagement: calculateEngagement(user),
      
      // Tendencias
      moodTrend: calculateMoodTrend(user),
      weeklyProgress: calculateWeeklyProgress(user),
      
      // Metas sugeridas
      goals: generateGoals(user)
    };

    logger.info('Overview generado exitosamente', { 
      userId, 
      sessions: overview.totalSessions,
      mood: overview.moodAverage 
    });

    res.json({ overview });

  } catch (error) {
    logger.error('Error generando overview', { 
      userId: req.userId, 
      error: error.message,
      stack: error.stack 
    });
    
    res.status(500).json({ 
      error: 'Error interno del servidor',
      message: 'No se pudo generar el overview'
    });
  }
});

// ✅ FUNCIONES AUXILIARES
function calculateStreak(lastActivity) {
  if (!lastActivity) return 0;
  
  const now = new Date();
  const last = new Date(lastActivity);
  const diffTime = Math.abs(now - last);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays <= 1 ? 1 : 0; // Simplificado para este ejemplo
}

function calculateTrend(history) {
  if (history.length < 2) return 'stable';
  
  const recent = history.slice(0, 5);
  const older = history.slice(5, 10);
  
  const recentAvg = recent.reduce((sum, entry) => sum + entry.mood, 0) / recent.length;
  const olderAvg = older.length > 0 ? 
    older.reduce((sum, entry) => sum + entry.mood, 0) / older.length : recentAvg;
  
  const diff = recentAvg - olderAvg;
  
  if (diff > 0.5) return 'improving';
  if (diff < -0.5) return 'declining';
  return 'stable';
}

function calculateEngagement(user) {
  if (!user.totalSessions || !user.daysTracked) return 'low';
  
  const ratio = user.totalSessions / user.daysTracked;
  
  if (ratio >= 3) return 'high';
  if (ratio >= 1.5) return 'medium';
  return 'low';
}

function calculateMoodTrend(user) {
  if (!user.moodAverage) return 'neutral';
  
  if (user.moodAverage >= 7) return 'positive';
  if (user.moodAverage <= 4) return 'negative';
  return 'neutral';
}

function calculateWeeklyProgress(user) {
  // Simular progreso semanal basado en días tracked
  const weeklyGoal = 5; // Meta de 5 días por semana
  const progress = Math.min((user.daysTracked % 7) / weeklyGoal, 1) * 100;
  
  return Math.round(progress);
}

function generateGoals(user) {
  const goals = [];
  
  if (user.daysTracked < 7) {
    goals.push('Registra tu estado de ánimo diariamente por una semana');
  }
  
  if (user.moodAverage < 5) {
    goals.push('Explora técnicas de mindfulness para mejorar tu bienestar');
  }
  
  if (user.totalMessages < 10) {
    goals.push('Interactúa más con el asistente para desarrollar hábitos saludables');
  }
  
  if (goals.length === 0) {
    goals.push('¡Excelente trabajo! Mantén tu progreso constante');
  }
  
  return goals;
}

module.exports = router;
