const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../logger');

const router = express.Router();

// ✅ MIDDLEWARE DE AUTENTICACIÓN MEJORADO
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      logger.warn('Token no proporcionado', { path: req.path, ip: req.ip });
      return res.status(401).json({ error: 'Token de acceso requerido' });
    }

    // Verificar y decodificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verificar que el usuario existe
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      logger.warn('Usuario no encontrado en BD', { userId: decoded.userId, ip: req.ip });
      return res.status(403).json({ error: 'Usuario no encontrado' });
    }

    // Adjuntar usuario a la request
    req.user = user;
    req.userId = decoded.userId;
    
    next();
  } catch (error) {
    logger.error('Error en autenticación', { 
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

// ✅ VALIDAR LÍMITES DE CONVERSACIÓN
const checkConversationLimit = (req, res, next) => {
  const messages = req.body.messages || [];
  const MAX_MESSAGES = 50;
  
  if (messages.length > MAX_MESSAGES) {
    return res.status(400).json({ 
      error: `Máximo ${MAX_MESSAGES} mensajes por conversación` 
    });
  }
  
  next();
};

// ✅ VALIDAR ENTRADA DE CRISIS
const validateCrisisInput = (req, res, next) => {
  const message = req.body.message?.toLowerCase() || '';
  
  const crisisKeywords = [
    'suicid', 'suicidio', 'matarme', 'quiero morir', 'terminar con todo',
    'no veo salida', 'desesperacion', 'autolesionar', 'lastimarme',
    'mejor sin mí', 'no vale la pena', 'muy triste para vivir'
  ];
  
  const isCrisis = crisisKeywords.some(keyword => message.includes(keyword));
  
  if (isCrisis) {
    req.isCrisis = true;
  }
  
  next();
};

// ✅ CHAT CON OPENAI + FALLBACK
router.post('/', authenticateToken, checkConversationLimit, validateCrisisInput, async (req, res) => {
  try {
    const { message, messages = [] } = req.body;
    const userId = req.userId;
    
    if (!message) {
      return res.status(400).json({ error: 'El mensaje es requerido' });
    }

    logger.info('Mensaje de chat recibido', { 
      userId, 
      messageLength: message.length, 
      messagesCount: messages.length,
      ip: req.ip 
    });

    // ✅ VALIDACIÓN DE CRISIS
    if (req.isCrisis) {
      logger.warn('Palabras de crisis detectadas', { 
        userId, 
        message: message.substring(0, 100),
        ip: req.ip 
      });
      
      const crisisResponse = {
        response: "Estoy muy preocupado por lo que me dices. Por favor, busca ayuda profesional inmediatamente. Si estás en peligro, contacta los servicios de emergencia. También puedes llamar a líneas de crisis como:\n\n• Línea de crisis emocional: 024\n• Emergencias: 911\n• Chat de ayuda: https://www.crisistextline.org/\n\nTu vida es valiosa y hay personas que pueden ayudarte. No estás solo en esto.",
        type: 'crisis',
        isEmergency: true
      };
      
      // Actualizar estadísticas del usuario
      await User.updateOne(
        { _id: userId },
        {
          $inc: { totalSessions: 1, totalMessages: 1 },
          $set: { lastActivity: new Date() }
        }
      );
      
      return res.json(crisisResponse);
    }

    let chatResponse = '';

    // ✅ INTENTO CON OPENAI
    try {
      const OpenAI = require('openai');
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const systemPrompt = `Eres MindSync, un asistente de bienestar emocional empático y comprensivo. Tu objetivo es:

1. Ser un escucha activo y sin juicios
2. Ofrecer apoyo emocional genuino
3. Hacer preguntas reflexivas para ayudar a la autoexploración
4. Proporcionar técnicas simples de mindfulness y bienestar
5. Mantener un tono cálido, profesional y esperanzador
6. Siempre validar los sentimientos de la persona
7. Si detectas pensamientos suicidas o de autolesión, responder con urgencia y proporcionar recursos de ayuda

Responde de manera concisa pero cálida, generalmente en 2-3 párrafos. Nunca prometas soluciones mágicas, sino apoyo genuino en el proceso de bienestar.`;

      const completion = await client.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map(msg => ({ role: msg.role, content: msg.content })),
          { role: "user", content: message }
        ],
        max_tokens: 500,
        temperature: 0.7,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      });

      chatResponse = completion.choices[0].message.content.trim();
      logger.info('Respuesta de OpenAI generada', { 
        userId, 
        responseLength: chatResponse.length 
      });

    } catch (openaiError) {
      logger.error('Error con OpenAI, usando respuesta de fallback', { 
        userId, 
        error: openaiError.message 
      });
      
      // ✅ RESPUESTA DE FALLBACK
      const fallbackResponses = [
        "Gracias por compartir conmigo lo que sientes. Entiendo que puede ser difícil expresar lo que hay en tu interior. ¿Qué te gustaría explorar más profundamente hoy?",
        "Escucho que estás pasando por un momento difícil. Recuerda que cada día es una nueva oportunidad para cuidar de ti mismo. ¿Hay algo específico que te gustaría trabajar?",
        "Valoro mucho que compartas tus pensamientos conmigo. El bienestar emocional es un proceso, y estar aquí hablando es un paso importante. ¿Cómo puedo apoyarte mejor?",
        "Es muy valiente de tu parte buscar apoyo. Cada persona merece sentir paz y equilibrio. ¿Qué te ayudaría a sentirte un poco mejor en este momento?"
      ];
      
      const randomIndex = Math.floor(Math.random() * fallbackResponses.length);
      chatResponse = fallbackResponses[randomIndex];
      
      logger.info('Respuesta de fallback usada', { 
        userId, 
        response: chatResponse.substring(0, 100) 
      });
    }

    // ✅ ACTUALIZAR ESTADÍSTICAS DEL USUARIO
    try {
      await User.updateOne(
        { _id: userId },
        {
          $inc: { 
            totalSessions: 1, 
            totalMessages: 1 
          },
          $set: { 
            lastActivity: new Date() 
          }
        }
      );
      logger.info('Estadísticas de usuario actualizadas', { userId });
    } catch (statsError) {
      logger.error('Error actualizando estadísticas', { 
        userId, 
        error: statsError.message 
      });
      // No es crítico, continuar sin fallo
    }

    // ✅ RESPUESTA FINAL
    const response = {
      response: chatResponse,
      type: 'normal',
      timestamp: new Date().toISOString(),
      sessionId: userId
    };

    logger.info('Chat completado exitosamente', { 
      userId, 
      responseType: response.type 
    });

    res.json(response);

  } catch (error) {
    logger.error('Error en chat', { 
      userId: req.userId, 
      error: error.message, 
      stack: error.stack,
      ip: req.ip 
    });
    
    res.status(500).json({ 
      error: 'Error interno del servidor',
      message: 'Ha ocurrido un error procesando tu mensaje. Por favor intenta de nuevo.'
    });
  }
});

module.exports = router;
