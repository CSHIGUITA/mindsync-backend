const express = require('express');
const mongoose = require('mongoose');
const logger = require('../logger'); // Usar logger personalizado
const OpenAI = require('openai');
const router = express.Router();

// Inicializar OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Middleware simple de autenticación
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

// POST /api/chat - Enviar mensaje
router.post('/', authenticate, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Mensaje requerido' 
      });
    }
    
    if (message.length > 1000) {
      return res.status(400).json({ 
        error: 'El mensaje es demasiado largo (máximo 1000 caracteres)' 
      });
    }
    
    logger.info(`Chat request from user: ${req.user.email}`, {
      userId: req.userId,
      messageLength: message.length
    });
    
    // Generar respuesta con OpenAI
    let aiResponse = '';
    
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `Eres MindSync, un asistente de bienestar emocional especializado en salud mental. 
            
Tu trabajo es:
- Ofrecer apoyo emocional empático y no judgemental
- Usar técnicas de terapia cognitiva y conductual
- Hacer preguntas reflexivas que ayuden al usuario a explorar sus pensamientos
- Proporcionar ejercicios y técnicas de mindfulness cuando sea apropiado
- Detectar señales de crisis y responder apropiadamente
- Mantener un tono cálido, profesional y comprensivo

NUNCA:
- Dar consejos médicos específicos o diagnosticar
- Reemplazar terapia profesional
- Prometer curas o soluciones rápidas
- Ignorar señales de autolesión o suicidio

Responde en español de manera empática y profesional.`
          },
          {
            role: "user",
            content: message
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      });
      
      aiResponse = completion.choices[0].message.content.trim();
      
    } catch (openaiError) {
      logger.error('Error con OpenAI:', openaiError);
      
      // Respuesta de fallback si OpenAI falla
      aiResponse = `Gracias por compartir esto conmigo. Entiendo que puede ser difícil y aprecio tu confianza al hablar sobre esto. 

¿Te gustaría que exploremos juntos cómo te sientes en este momento? A veces, verbalizar nuestros pensamientos y emociones puede ayudarnos a entender mejor nuestra situación.

Algunas preguntas que podrían ayudarte a reflexionar:
- ¿Qué situaciones específicas están causando que te sientas así?
- ¿Has notado patrones en estos sentimientos?
- ¿Qué estrategias has probado antes que te hayan ayudado?

Recuerda que estoy aquí para acompañarte en este proceso. ¿Qué te gustaría explorar primero?`;
    }
    
    // Actualizar estadísticas del usuario
    await req.user.updateOne({
      $inc: {
        'stats.totalSessions': 1,
        'stats.totalMessages': 2
      },
      $set: {
        'stats.lastActivity': new Date()
      }
    });
    
    logger.info(`Chat response sent to user: ${req.user.email}`, {
      userId: req.userId,
      responseLength: aiResponse.length
    });
    
    res.json({
      success: true,
      response: aiResponse,
      userMessage: message,
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error en chat:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor al procesar el mensaje' 
    });
  }
});

// GET /api/chat/history - Obtener historial
router.get('/history', authenticate, async (req, res) => {
  try {
    // Por ahora devolver historial vacío - se puede implementar después
    res.json({
      success: true,
      history: [],
      totalSessions: req.user.stats.totalSessions || 0
    });
  } catch (error) {
    logger.error('Error obteniendo historial:', error);
    res.status(500).json({ 
      error: 'Error al obtener historial' 
    });
  }
});

module.exports = router;
