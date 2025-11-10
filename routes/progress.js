const express = require('express');
const User = require('../models/User');
const { auth, requirePremium } = require('../middleware/auth');
const { validateMoodEntry, validateQuery } = require('../middleware/validation');
const Joi = require('joi');

const router = express.Router();

// Esquema para consultas de progreso
const progressQuerySchema = Joi.object({
  period: Joi.string()
    .valid('week', 'month', 'quarter', 'year', 'all')
    .default('month'),
  
  startDate: Joi.date()
    .iso()
    .optional(),
  
  endDate: Joi.date()
    .iso()
    .min(Joi.ref('startDate'))
    .optional()
});

// Esquema para metas
const goalSchema = Joi.object({
  title: Joi.string()
    .min(3)
    .max(100)
    .required(),
  
  description: Joi.string()
    .max(500)
    .optional(),
  
  category: Joi.string()
    .valid('wellness', 'therapy', 'mindfulness', 'productivity', 'relationships', 'self-care')
    .required(),
  
  target: Joi.object({
    value: Joi.number()
      .min(1)
      .required(),
    
    unit: Joi.string()
      .valid('sessions', 'days', 'hours', 'meditation', 'exercise', 'reading')
      .required()
  }).required(),
  
  deadline: Joi.date()
    .iso()
    .greater('now')
    .optional()
});

// Agregar entrada de estado de ánimo
router.post('/mood', auth, validateMoodEntry, async (req, res) => {
  try {
    const { userId } = req.user;
    const { mood, context } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    // Agregar entrada de estado de ánimo
    await user.addMoodEntry(mood, context);
    
    res.json({
      success: true,
      message: 'Estado de ánimo registrado exitosamente',
      data: {
        mood,
        context,
        timestamp: new Date().toISOString(),
        stats: user.stats
      }
    });

  } catch (error) {
    console.error('Error registrando estado de ánimo:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
});

// Obtener tendencias de estado de ánimo
router.get('/mood/trends', auth, validateQuery(progressQuerySchema), async (req, res) => {
  try {
    const { userId } = req.user;
    const { period, startDate, endDate } = req.query;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    // Filtrar tendencias por período
    const now = new Date();
    let start = new Date();
    
    switch (period) {
      case 'week':
        start.setDate(now.getDate() - 7);
        break;
      case 'month':
        start.setDate(now.getDate() - 30);
        break;
      case 'quarter':
        start.setDate(now.getDate() - 90);
        break;
      case 'year':
        start.setDate(now.getDate() - 365);
        break;
      default:
        start = new Date(0); // All time
    }
    
    // Aplicar filtros de fecha si se proporcionan
    let trends = user.stats.moodTrends;
    if (startDate) {
      trends = trends.filter(entry => new Date(entry.date) >= new Date(startDate));
    }
    if (endDate) {
      trends = trends.filter(entry => new Date(entry.date) <= new Date(endDate));
    }
    
    // Calcular estadísticas
    const moodData = trends.filter(entry => entry.date >= start);
    const averageMood = moodData.length > 0 
      ? moodData.reduce((sum, entry) => sum + entry.mood, 0) / moodData.length
      : 0;
    
    const moodDistribution = {
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0,
      6: 0, 7: 0, 8: 0, 9: 0, 10: 0
    };
    
    moodData.forEach(entry => {
      moodDistribution[entry.mood] = (moodDistribution[entry.mood] || 0) + 1;
    });
    
    // Calcular tendencia (últimos 7 vs anteriores 7)
    const recentEntries = moodData.slice(-7);
    const previousEntries = moodData.slice(-14, -7);
    
    const recentAvg = recentEntries.length > 0
      ? recentEntries.reduce((sum, entry) => sum + entry.mood, 0) / recentEntries.length
      : 0;
    const previousAvg = previousEntries.length > 0
      ? previousEntries.reduce((sum, entry) => sum + entry.mood, 0) / previousEntries.length
      : 0;
    
    const trend = recentAvg > previousAvg ? 'improving' 
                : recentAvg < previousAvg ? 'declining' 
                : 'stable';

    res.json({
      success: true,
      data: {
        period,
        averageMood: Math.round(averageMood * 10) / 10,
        totalEntries: moodData.length,
        moodDistribution,
        recentTrend: trend,
        trendChange: Math.round((recentAvg - previousAvg) * 10) / 10,
        recentEntries: recentEntries.slice(-10), // Últimas 10 entradas
        dateRange: {
          start: start.toISOString(),
          end: now.toISOString()
        }
      }
    });

  } catch (error) {
    console.error('Error obteniendo tendencias de estado de ánimo:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
});

// Obtener estadísticas generales de progreso
router.get('/stats', auth, async (req, res) => {
  try {
    const { userId } = req.user;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    // Calcular estadísticas detalladas
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Sesiones esta semana
    const sessionsThisWeek = user.stats.sessionsThisWeek;
    
    // Racha actual
    const currentStreak = user.stats.streakDays;
    
    // Promedio de estado de ánimo del mes
    const moodEntriesThisMonth = user.stats.moodTrends.filter(
      entry => new Date(entry.date) >= monthAgo
    );
    const averageMoodThisMonth = moodEntriesThisMonth.length > 0
      ? moodEntriesThisMonth.reduce((sum, entry) => sum + entry.mood, 0) / moodEntriesThisMonth.length
      : 0;
    
    // Progreso en metas (simulado por ahora)
    const goalsProgress = user.stats.goalsCompleted;
    
    // Calcular nivel de actividad
    const activityLevel = sessionsThisWeek >= 7 ? 'high'
                         : sessionsThisWeek >= 3 ? 'medium'
                         : sessionsThisWeek >= 1 ? 'low'
                         : 'inactive';
    
    res.json({
      success: true,
      data: {
        overview: {
          totalSessions: user.stats.totalSessions,
          totalMessages: user.stats.totalMessages,
          currentStreak: currentStreak,
          longestStreak: currentStreak, // Simplificado
          daysActive: Math.floor((now - user.createdAt) / (1000 * 60 * 60 * 24))
        },
        weeklyActivity: {
          sessionsThisWeek,
          targetSessions: user.subscriptionPlan === 'free' ? 5 : 20,
          activityLevel,
          progress: Math.min((sessionsThisWeek / (user.subscriptionPlan === 'free' ? 5 : 20)) * 100, 100)
        },
        moodAnalysis: {
          averageMood: Math.round(averageMoodThisMonth * 10) / 10,
          moodEntriesThisMonth: moodEntriesThisMonth.length,
          moodTrend: 'stable' // Simplificado
        },
        engagement: {
          sessionsPerWeek: sessionsThisWeek,
          messagesPerSession: user.stats.totalSessions > 0 
            ? Math.round((user.stats.totalMessages / user.stats.totalSessions) * 10) / 10
            : 0,
          lastActivity: user.stats.lastSessionDate
        },
        goals: {
          completed: goalsProgress,
          total: Math.max(goalsProgress, 3), // Simulado
          completionRate: Math.min((goalsProgress / Math.max(goalsProgress, 3)) * 100, 100)
        },
        subscription: {
          plan: user.subscriptionPlan,
          canStartSession: user.canStartSession(),
          usagePercent: user.stats.sessionsThisWeek / (user.subscriptionPlan === 'free' ? 5 : 20) * 100
        }
      }
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas de progreso:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
});

// Obtener análisis detallado (solo para usuarios premium)
router.get('/analytics', auth, requirePremium, async (req, res) => {
  try {
    const { userId } = req.user;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    // Análisis más profundo solo para premium
    const now = new Date();
    const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Patrones de uso por hora del día
    const usageByHour = {};
    for (let i = 0; i < 24; i++) {
      usageByHour[i] = 0;
    }
    
    // Distribución de estados de ánimo por contexto
    const moodByContext = {};
    
    // Análisis de progreso semanal
    const weeklyProgress = [];
    for (let week = 0; week < 4; week++) {
      const weekStart = new Date(now.getTime() - (week + 1) * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const weekEntries = user.stats.moodTrends.filter(entry => {
        const entryDate = new Date(entry.date);
        return entryDate >= weekStart && entryDate < weekEnd;
      });
      
      const avgMood = weekEntries.length > 0
        ? weekEntries.reduce((sum, entry) => sum + entry.mood, 0) / weekEntries.length
        : 0;
      
      weeklyProgress.push({
        week: week + 1,
        averageMood: Math.round(avgMood * 10) / 10,
        entries: weekEntries.length,
        startDate: weekStart.toISOString(),
        endDate: weekEnd.toISOString()
      });
    }
    
    res.json({
      success: true,
      data: {
        detailedAnalysis: {
          usagePatterns: {
            mostActiveHour: 15, // Simplificado
            usageByHour,
            averageSessionLength: 25 // minutos simulados
          },
          moodInsights: {
            moodByContext,
            bestDaysForMood: ['martes', 'jueves'], // Simplificado
            improvementAreas: ['sleep', 'stress management']
          },
          weeklyProgress: weeklyProgress.reverse(),
          recommendations: [
            'Mantén tu rutina de sesiones regulares',
            'Practica mindfulness durante los momentos de estrés',
            'Considera aumentar tu actividad física',
            'Mantén un registro consistente de tu estado de ánimo'
          ]
        }
      }
    });

  } catch (error) {
    console.error('Error obteniendo análisis detallado:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
});

// Crear meta personal
router.post('/goals', auth, async (req, res) => {
  try {
    const { userId } = req.user;
    const { title, description, category, target, deadline } = req.body;
    
    // Validar datos
    const { error, value } = goalSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Datos de meta inválidos',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    
    // Por ahora, simulamos guardar la meta
    // En una implementación real, esto se guardaría en la base de datos
    const newGoal = {
      id: `goal_${Date.now()}`,
      title: value.title,
      description: value.description,
      category: value.category,
      target: value.target,
      deadline: value.deadline,
      progress: 0,
      createdAt: new Date().toISOString(),
      status: 'active'
    };
    
    res.json({
      success: true,
      message: 'Meta creada exitosamente',
      data: newGoal
    });

  } catch (error) {
    console.error('Error creando meta:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
});

// Obtener metas del usuario
router.get('/goals', auth, async (req, res) => {
  try {
    const { userId } = req.user;
    
    // Por ahora, simulamos algunas metas
    // En una implementación real, esto vendría de la base de datos
    const goals = [
      {
        id: 'goal_1',
        title: 'Completar 20 sesiones de terapia',
        description: 'Mantener una rutina consistente de sesiones terapéuticas',
        category: 'therapy',
        target: { value: 20, unit: 'sessions' },
        progress: 8,
        status: 'active',
        deadline: '2024-12-31',
        createdAt: '2024-01-01T00:00:00.000Z'
      },
      {
        id: 'goal_2',
        title: 'Meditar 30 días seguidos',
        description: 'Desarrollar una práctica diaria de mindfulness',
        category: 'mindfulness',
        target: { value: 30, unit: 'days' },
        progress: 15,
        status: 'active',
        deadline: '2024-11-30',
        createdAt: '2024-10-01T00:00:00.000Z'
      }
    ];
    
    res.json({
      success: true,
      data: {
        goals,
        summary: {
          total: goals.length,
          active: goals.filter(g => g.status === 'active').length,
          completed: goals.filter(g => g.status === 'completed').length,
          averageProgress: goals.reduce((sum, goal) => sum + (goal.progress / goal.target.value * 100), 0) / goals.length
        }
      }
    });

  } catch (error) {
    console.error('Error obteniendo metas:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
});

// Actualizar progreso de meta
router.put('/goals/:goalId/progress', auth, async (req, res) => {
  try {
    const { userId } = req.user;
    const { goalId } = req.params;
    const { progress } = req.body;
    
    if (progress < 0 || progress > 100) {
      return res.status(400).json({
        error: 'El progreso debe estar entre 0 y 100'
      });
    }
    
    // Simular actualización
    // En una implementación real, esto actualizaría la base de datos
    const updatedGoal = {
      id: goalId,
      progress: progress,
      status: progress >= 100 ? 'completed' : 'active',
      lastUpdated: new Date().toISOString()
    };
    
    res.json({
      success: true,
      message: 'Progreso actualizado exitosamente',
      data: updatedGoal
    });

  } catch (error) {
    console.error('Error actualizando progreso de meta:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
});

module.exports = router;
