const express = require('express');
const mongoose = require('mongoose');
const logger = require('../logger'); // Usar logger personalizado
const router = express.Router();

// Middleware de autenticación simple
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autorización requerido' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Buscar usuario
    const User = mongoose.model('User');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    
    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    logger.error('Error de autenticación:', error);
    res.status(401).json({ error: 'Token inválido' });
  }
}

// GET /api/progress - Obtener estadísticas del usuario
router.get('/', authenticate, async (req, res) => {
  try {
    const user = req.user;
    
    // Calcular estadísticas básicas
    const stats = {
      totalSessions: user.stats?.totalSessions || 0,
      moodAverage: 7.5, // Placeholder por ahora
      daysTracked: user.stats?.streakDays || 0,
      totalMessages: user.stats?.totalMessages || 0,
      lastSessionDate: user.stats?.lastSessionDate || null
    };
    
    logger.info(`Progress requested for user: ${user.email}`, {
      userId: req.userId,
      stats
    });
    
    res.json({
      success: true,
      ...stats
    });
    
  } catch (error) {
    logger.error('Error obteniendo progreso:', error);
    res.status(500).json({ 
      error: 'Error al obtener progreso' 
    });
  }
});

// POST /api/progress - Guardar estado de ánimo
router.post('/', authenticate, async (req, res) => {
  try {
    const { mood } = req.body;
    const user = req.user;
    
    if (!mood || mood < 1 || mood > 10) {
      return res.status(400).json({ 
        error: 'El estado de ánimo debe estar entre 1 y 10' 
      });
    }
    
    // Agregar entrada de estado de ánimo al usuario
    await user.addMoodEntry(mood, 'User reported mood');
    
    // Actualizar estadísticas
    await user.updateOne({
      $inc: {
        'stats.totalSessions': 1
      },
      $set: {
        'stats.lastActivity': new Date()
      }
    });
    
    logger.info(`Mood entry saved for user: ${user.email}`, {
      userId: req.userId,
      mood
    });
    
    res.json({
      success: true,
      message: 'Estado de ánimo guardado exitosamente',
      mood: mood
    });
    
  } catch (error) {
    logger.error('Error guardando estado de ánimo:', error);
    res.status(500).json({ 
      error: 'Error al guardar estado de ánimo' 
    });
  }
});

// GET /api/progress/mood-history - Historial de estados de ánimo
router.get('/mood-history', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const moodTrends = user.stats?.moodTrends || [];
    
    // Obtener los últimos 30 registros
    const recentMoods = moodTrends
      .slice(-30)
      .map(entry => ({
        date: entry.date,
        mood: entry.mood,
        context: entry.context
      }));
    
    res.json({
      success: true,
      moodHistory: recentMoods,
      totalEntries: moodTrends.length
    });
    
  } catch (error) {
    logger.error('Error obteniendo historial de estado de ánimo:', error);
    res.status(500).json({ 
      error: 'Error al obtener historial' 
    });
  }
});

// GET /api/progress/overview - Resumen general del progreso
router.get('/overview', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const moodTrends = user.stats?.moodTrends || [];
    
    // Calcular promedio de estado de ánimo
    const averageMood = moodTrends.length > 0 
      ? moodTrends.reduce((sum, entry) => sum + entry.mood, 0) / moodTrends.length
      : 0;
    
    // Calcular racha actual
    let currentStreak = 0;
    if (moodTrends.length > 0) {
      const sortedTrends = moodTrends.sort((a, b) => new Date(b.date) - new Date(a.date));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      for (let i = 0; i < sortedTrends.length; i++) {
        const entryDate = new Date(sortedTrends[i].date);
        entryDate.setHours(0, 0, 0, 0);
        
        const daysDiff = Math.floor((today - entryDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === currentStreak) {
          currentStreak++;
        } else {
          break;
        }
      }
    }
    
    const overview = {
      totalSessions: user.stats?.totalSessions || 0,
      averageMood: Math.round(averageMood * 10) / 10,
      currentStreak,
      totalMoodEntries: moodTrends.length,
      lastActivity: user.stats?.lastActivity || null,
      subscriptionPlan: user.subscriptionPlan || 'free'
    };
    
    res.json({
      success: true,
      overview
    });
    
  } catch (error) {
    logger.error('Error obteniendo overview:', error);
    res.status(500).json({ 
      error: 'Error al obtener resumen' 
    });
  }
});

module.exports = router;
