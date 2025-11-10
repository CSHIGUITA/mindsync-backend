const express = require('express');
const User = require('../models/User');
const { auth, checkSessionLimit } = require('../middleware/auth');
const { validateChat } = require('../middleware/validation');
const aiService = require('../services/aiService');

const router = express.Router();

// Variable para almacenar conversaciones en memoria (temporal)
const conversations = new Map();

// Función para detectar crisis de salud mental
const detectCrisis = (message) => {
  const crisisKeywords = [
    'suicidio', 'suicide', 'matarmé', 'matarme', 'lastimarme', 'lastimarme',
    'no quiero vivir', 'me quiero morir', 'quiero acabar con todo',
    'kill myself', 'end my life', 'hurt myself', 'kill me',
    'atacar', 'herir', 'lastimar', 'violence', 'self-harm',
    'depresión severa', 'no puedo más', 'cannot take it anymore',
    'trying to end', 'possession overdose', 'overdose', 'drogas letales'
  ];

  const messageLower = message.toLowerCase();
  return crisisKeywords.some(keyword => messageLower.includes(keyword));
};

// Función para generar recursos de crisis
const generateCrisisResources = (language = 'es') => {
  if (language === 'es') {
    return {
      type: 'crisis_intervention',
      message: 'Estoy preocupado por tu bienestar. Es importante que busques ayuda profesional inmediatamente.',
      resources: [
        {
          name: 'Línea de Prevención del Suicidio',
          phone: '1-800-273-8255',
          description: 'Disponible 24/7 en español'
        },
        {
          name: 'Chat de Crisis',
          url: 'https://www.crisistextline.org/es',
          description: 'Soporte por mensaje de texto 24/7'
        },
        {
          name: 'Emergencias',
          phone: '123',
          description: 'Línea de emergencias en Colombia'
        }
      ],
      actionRequired: 'immediate',
      priority: 'high'
    };
  } else {
    return {
      type: 'crisis_intervention',
      message: 'I am concerned about your wellbeing. It is important that you seek professional help immediately.',
      resources: [
        {
          name: 'National Suicide Prevention Lifeline',
          phone: '1-800-273-8255',
          description: 'Available 24/7'
        },
        {
          name: 'Crisis Text Line',
          url: 'https://www.crisistextline.org',
          description: 'Text support available 24/7'
        },
        {
          name: 'Emergency Services',
          phone: '911',
          description: 'Call for immediate emergency help'
        }
      ],
      actionRequired: 'immediate',
      priority: 'high'
    };
  }
};

// Iniciar nueva sesión de chat
router.post('/session/start', auth, checkSessionLimit, async (req, res) => {
  try {
    const { userId } = req.user;
    
    // Crear nueva sesión
    const sessionId = `session_${userId}_${Date.now()}`;
    const conversationId = `conv_${userId}_${Date.now()}`;
    
    // Inicializar conversación en memoria
    conversations.set(conversationId, {
      userId,
      sessionId,
      messages: [],
      context: {
        currentMood: 5,
        sessionStart: new Date(),
        lastActivity: new Date()
      }
    });
    
    // Obtener información del usuario para personalizar la respuesta
    const user = await User.findById(userId);
    
    // Mensaje de bienvenida personalizado
    const welcomeMessage = `¡Hola ${user.name}! Soy tu asistente de salud mental. Estoy aquí para apoyarte y acompañarte en tu bienestar emocional. 

¿En qué puedo ayudarte hoy? Puedes contarme cómo te sientes, compartir una situación que te preocupe, o simplemente conversar sobre temas que te interesen.

Recuerda que soy un asistente de apoyo y siempre es recomendable complementar con la ayuda de profesionales de la salud mental.`;

    // Agregar mensaje de sistema
    const initialMessage = {
      id: `msg_${Date.now()}`,
      role: 'system',
      content: welcomeMessage,
      timestamp: new Date().toISOString(),
      type: 'welcome'
    };
    
    // Actualizar conversación
    const conversation = conversations.get(conversationId);
    conversation.messages.push(initialMessage);
    
    // Actualizar estadísticas del usuario
    await user.updateSessionStats();
    
    res.json({
      success: true,
      sessionId,
      conversationId,
      message: {
        id: initialMessage.id,
        content: welcomeMessage,
        timestamp: initialMessage.timestamp,
        type: 'system'
      },
      user: {
        id: user._id,
        name: user.name,
        subscriptionPlan: user.subscriptionPlan,
        stats: user.stats
      }
    });

  } catch (error) {
    console.error('Error iniciando sesión de chat:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor al iniciar sesión de chat' 
    });
  }
});

// Enviar mensaje en el chat
router.post('/message', auth, validateChat, async (req, res) => {
  try {
    const { userId } = req.user;
    const { message, conversationId, context } = req.body;
    
    // Obtener conversación
    const conversation = conversations.get(conversationId);
    if (!conversation || conversation.userId !== userId) {
      return res.status(404).json({ 
        error: 'Conversación no encontrada' 
      });
    }
    
    // Verificar si es crisis
    const isCrisis = detectCrisis(message);
    
    if (isCrisis) {
      const user = await User.findById(userId);
      const language = user.preferences.language || 'es';
      
      const crisisResponse = generateCrisisResources(language);
      
      // Log de crisis para análisis posterior
      console.log(`🚨 CRISIS DETECTED for user ${userId}: ${message}`);
      
      res.json({
        success: true,
        type: 'crisis_alert',
        data: crisisResponse,
        timestamp: new Date().toISOString()
      });
      
      return;
    }
    
    // Agregar mensaje del usuario a la conversación
    const userMessage = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
      context: context || {}
    };
    conversation.messages.push(userMessage);
    
    // Generar respuesta de la IA
    const aiResponse = await aiService.generateResponse({
      message: userMessage.content,
      conversationHistory: conversation.messages.slice(-10), // Últimos 10 mensajes
      userContext: context || conversation.context,
      userId: userId
    });
    
    // Agregar respuesta de la IA
    const aiMessage = {
      id: `msg_${Date.now()}_ai`,
      role: 'assistant',
      content: aiResponse.content,
      timestamp: new Date().toISOString(),
      suggestions: aiResponse.suggestions || [],
      type: aiResponse.type || 'text'
    };
    conversation.messages.push(aiMessage);
    
    // Actualizar contexto de la conversación
    conversation.context = {
      ...conversation.context,
      lastActivity: new Date(),
      currentMood: context?.currentMood || conversation.context.currentMood
    };
    
    // Actualizar estadísticas del usuario
    const user = await User.findById(userId);
    user.stats.totalMessages += 1;
    await user.save();
    
    res.json({
      success: true,
      message: aiMessage,
      conversationId,
      context: conversation.context,
      suggestions: aiMessage.suggestions
    });

  } catch (error) {
    console.error('Error procesando mensaje de chat:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor al procesar mensaje' 
    });
  }
});

// Obtener historial de conversación
router.get('/conversation/:conversationId', auth, async (req, res) => {
  try {
    const { userId } = req.user;
    const { conversationId } = req.params;
    
    const conversation = conversations.get(conversationId);
    if (!conversation || conversation.userId !== userId) {
      return res.status(404).json({ 
        error: 'Conversación no encontrada' 
      });
    }
    
    res.json({
      success: true,
      conversation: {
        id: conversationId,
        messages: conversation.messages,
        context: conversation.context,
        createdAt: conversation.sessionStart
      }
    });

  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
});

// Sugerencias de respuesta
router.get('/suggestions', auth, async (req, res) => {
  try {
    const suggestions = [
      '¿Cómo te sientes hoy?',
      'Cuéntame sobre tu día',
      'Tengo ansiedad',
      'Me siento triste',
      'Quiero hablar sobre mi trabajo',
      'Tengo problemas con mi familia',
      'Necesito técnicas de relajación',
      '¿Puedes ayudarme con mindfulness?',
      '¿Qué es la terapia cognitiva?',
      'Necesito motivación',
      'Tengo problemas de sueño',
      'Quiero mejorar mi autoestima',
      'Necesito manejar el estrés',
      '¿Cómo puedo ser más feliz?',
      'Quiero hablar de mis miedos'
    ];
    
    // Filtrar sugerencias según el plan del usuario
    const user = await User.findById(req.user.userId);
    const filteredSuggestions = user.subscriptionPlan === 'free' 
      ? suggestions.slice(0, 8)
      : suggestions;

    res.json({
      success: true,
      suggestions: filteredSuggestions,
      subscriptionPlan: user.subscriptionPlan
    });

  } catch (error) {
    console.error('Error obteniendo sugerencias:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
});

// Terminar sesión de chat
router.post('/session/end', auth, async (req, res) => {
  try {
    const { userId } = req.user;
    const { conversationId } = req.body;
    
    if (conversationId && conversations.has(conversationId)) {
      const conversation = conversations.get(conversationId);
      if (conversation.userId === userId) {
        conversations.delete(conversationId);
      }
    }
    
    res.json({
      success: true,
      message: 'Sesión terminada exitosamente'
    });

  } catch (error) {
    console.error('Error terminando sesión:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
});

// Obtener estadísticas de chat del usuario
router.get('/stats', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    
    res.json({
      success: true,
      stats: {
        totalSessions: user.stats.totalSessions,
        totalMessages: user.stats.totalMessages,
        sessionsThisWeek: user.stats.sessionsThisWeek,
        currentStreak: user.stats.streakDays,
        subscriptionPlan: user.subscriptionPlan,
        canStartSession: user.canStartSession(),
        lastSession: user.stats.lastSessionDate
      }
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
});

module.exports = router;
