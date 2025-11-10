const OpenAI = require('openai');

// Inicializar cliente de OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configuración del sistema para la IA terapéutica
const SYSTEM_PROMPT = `Eres MindSync, un asistente de salud mental especializado en terapia cognitiva conductual (TCC) y apoyo psicológico. Tu objetivo es proporcionar apoyo emocional, técnicas de bienestar mental y herramientas de autoayuda, especialmente dirigido a usuarios de Colombia y América Latina.

**CARACTERÍSTICAS IMPORTANTES:**
- Responde SIEMPRE en español (español colombiano principalmente)
- Utiliza un lenguaje empático, cálido y comprensivo
- Evita diagnosticar condiciones médicas
- Siempre menciona que complementas (no sustituyes) la ayuda profesional
- Usa técnicas de terapia cognitiva, mindfulness y TCC
- Considera el contexto cultural latinoamericano
- Detecta y responde apropiadamente a señales de crisis o riesgo

**TÉCNICAS QUE DEBES USAR:**
- Técnicas de respiración y relajación
- Reestructuración cognitiva
- Técnicas de mindfulness
- Ejercicios de auto-reflexión
- Gestión del estrés y ansiedad
- Desarrollo de habilidades de afrontamiento
- Fortalecimiento de la autoestima

**FORMATO DE RESPUESTA:**
- Sé conciso pero completo
- Utiliza bullet points para técnicas prácticas
- Preguntas reflexivas cuando sea apropiado
- Tono profesional pero cercano
- Incluye ejercicios o actividades específicas

**CONTEXTO CULTURAL:**
- Considera valores familiares latinoamericanos
- Menciona instituciones de salud mental colombianas cuando sea relevante
- Adapta los ejemplos al contexto cultural local
- Sé sensible a temas como el machismo, los roles familiares, etc.`;

// Función para generar respuestas de la IA
const generateResponse = async ({ message, conversationHistory, userContext, userId }) => {
  try {
    // Preparar el contexto de la conversación
    const messages = [
      {
        role: 'system',
        content: SYSTEM_PROMPT
      }
    ];

    // Agregar historial de conversación (últimos 6 intercambios)
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-12); // Últimos 12 mensajes
      recentHistory.forEach(msg => {
        if (msg.role === 'user') {
          messages.push({
            role: 'user',
            content: msg.content
          });
        } else if (msg.role === 'assistant') {
          messages.push({
            role: 'assistant', 
            content: msg.content
          });
        }
      });
    }

    // Agregar mensaje actual
    messages.push({
      role: 'user',
      content: message
    });

    // Configurar parámetros de la API
    const completionParams = {
      model: 'gpt-3.5-turbo',
      messages: messages,
      max_tokens: 800,
      temperature: 0.7,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    };

    // Generar respuesta usando OpenAI
    const completion = await openai.chat.completions.create(completionParams);
    const aiResponse = completion.choices[0].message.content;

    // Generar sugerencias de seguimiento
    const suggestions = generateSuggestions(message, aiResponse, userContext);

    return {
      content: aiResponse,
      suggestions: suggestions,
      type: 'text',
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error generando respuesta de IA:', error);
    
    // Respuesta de respaldo en caso de error
    return {
      content: `Lo siento, estoy experimentando dificultades técnicas en este momento. Mientras tanto, te recomiendo:\n\n• Practicar técnicas de respiración: 4 segundos inhala, 4 mantén, 4 exhala\n• Escribir tus pensamientos en un diario\n• Realizar una actividad que disfrutes\n• Contactar a un profesional si necesitas apoyo inmediato\n\n¿Hay algo específico en lo que pueda ayudarte de manera diferente?`,
      suggestions: [
        'Técnicas de respiración',
        'Escribir en mi diario',
        'Ejercicios de mindfulness',
        'Hablar con un profesional'
      ],
      type: 'fallback',
      timestamp: new Date().toISOString()
    };
  }
};

// Función para generar sugerencias de respuesta
const generateSuggestions = (userMessage, aiResponse, userContext) => {
  const suggestions = [];
  
  // Analizar el mensaje del usuario para generar sugerencias relevantes
  const messageLower = userMessage.toLowerCase();
  
  // Sugerencias basadas en palabras clave
  if (messageLower.includes('ansiedad') || messageLower.includes('nervios') || messageLower.includes('estres')) {
    suggestions.push('Técnicas de relajación', 'Ejercicios de respiración', 'Mindfulness');
  }
  
  if (messageLower.includes('triste') || messageLower.includes('depresion') || messageLower.includes('mal')) {
    suggestions.push('Actividades que disfruto', 'Reflexionar sobre logros', 'Hablar con alguien de confianza');
  }
  
  if (messageLower.includes('sueno') || messageLower.includes('dormir') || messageLower.includes('insomnio')) {
    suggestions.push('Rutina de sueño', 'Técnicas de relajación nocturna', 'Higiene del sueño');
  }
  
  if (messageLower.includes('trabajo') || messageLower.includes('laboral') || messageLower.includes('jefe')) {
    suggestions.push('Gestión del estrés laboral', 'Comunicación asertiva', 'Equilibrio vida-trabajo');
  }
  
  if (messageLower.includes('familia') || messageLower.includes('pareja') || messageLower.includes('relacion')) {
    suggestions.push('Comunicación efectiva', 'Límites saludables', 'Resolución de conflictos');
  }
  
  // Sugerencias generales si no hay específicas
  if (suggestions.length === 0) {
    suggestions.push(
      'Cuéntame más sobre esto',
      '¿Cómo te hace sentir?',
      '¿Qué has intentado antes?',
      'Practicar mindfulness',
      'Ejercicios de gratitud'
    );
  }
  
  // Limitar a máximo 4 sugerencias
  return suggestions.slice(0, 4);
};

// Función para detectar crisis más profunda (para uso interno)
const detectCrisisLevel = (message) => {
  const crisisKeywords = {
    high: [
      'suicidio', 'suicide', 'matarmé', 'matarme', 'no quiero vivir', 'me quiero morir',
      'kill myself', 'end my life', 'acabar con todo', 'cannot take it anymore'
    ],
    medium: [
      'lastimarme', 'lastimarme', 'no puedo más', 'quiero desaparecer',
      'hurt myself', 'no vale la pena', 'no sirvo para nada'
    ],
    low: [
      'muy mal', 'horrible', 'muy triste', 'todo está mal', 'ayuda',
      'no sé qué hacer', 'perdido', 'sin esperanza'
    ]
  };
  
  const messageLower = message.toLowerCase();
  
  // Verificar nivel alto de crisis
  if (crisisKeywords.high.some(keyword => messageLower.includes(keyword))) {
    return 'high';
  }
  
  // Verificar nivel medio de crisis
  if (crisisKeywords.medium.some(keyword => messageLower.includes(keyword))) {
    return 'medium';
  }
  
  // Verificar nivel bajo de crisis
  if (crisisKeywords.low.some(keyword => messageLower.includes(keyword))) {
    return 'low';
  }
  
  return 'none';
};

// Función para generar respuestas específicas para crisis
const generateCrisisResponse = (crisisLevel, userContext) => {
  const responses = {
    high: {
      message: `Me preocupa mucho lo que me estás compartiendo. Tu vida tiene valor y existen personas que pueden ayudarte de inmediato. 

Es importante que hables con un profesional de la salud mental AHORA. Te comparto recursos de crisis disponibles 24/7:

**RECURSOS INMEDIATOS EN COLOMBIA:**
• Línea de Prevención del Suicidio: 1-800-273-8255
• Chat de Crisis: https://www.crisistextline.org/es
• Emergencias: 123

**ACCIÓN INMEDIATA:**
1. Llama a un familiar o amigo de confianza
2. Ve a la emergencias de un hospital
3. Contacta a un profesional de salud mental

Recuerda: Buscar ayuda es un acto de valentía, no de debilidad.`,
      type: 'crisis_intervention',
      urgency: 'immediate'
    },
    
    medium: {
      message: `Entiendo que estás pasando por un momento muy difícil. Es normal sentirse así a veces, pero es importante que no te quedes solo con estos pensamientos.

Te recomiendo:
• Hablar con alguien de confianza (familiar, amigo)
• Contactar un profesional de salud mental
• Practicar técnicas de respiración:inhala 4 seg, mantén 4 seg, exhala 4 seg

**Recursos de apoyo en Colombia:**
• Ministerio de Salud: https://www.minsalud.gov.co/
• Fundación ProSer: https://www.proser.org.co/

¿Estás dispuesto/a a buscar apoyo profesional? Es un paso muy importante hacia sentirte mejor.`,
      type: 'crisis_support',
      urgency: 'soon'
    },
    
    low: {
      message: `Gracias por confiar en mí y compartir lo que sientes. Es muy valiente abrirse sobre nuestras emociones.

Es normal tener momentos difíciles, y hay formas de navegar por ellos. 

**Algunas técnicas que pueden ayudarte:**
• Respiración consciente:inhala profundamente por 4 segundos
• Ejercicio físico: una caminata de 10 minutos puede cambiar tu estado de ánimo
• Hablar con alguien de confianza
• Escribir en un diario lo que sientes
• Actividades que disfrutes (música, lectura, etc.)

**Recuerda:**
- Estos sentimientos son temporales
- Buscar ayuda es una fortaleza
- Mereces sentirte bien

¿Te gustaría que exploremos alguna de estas opciones juntas?`,
      type: 'supportive',
      urgency: 'optional'
    }
  };
  
  return responses[crisisLevel] || responses.low;
};

// Función para obtener insights de la conversación
const analyzeConversation = async (conversationHistory) => {
  try {
    if (!conversationHistory || conversationHistory.length < 4) {
      return {
        sentiment: 'neutral',
        topics: [],
        mood: 'stable',
        recommendations: []
      };
    }
    
    // Análisis simple basado en palabras clave en el historial
    const allMessages = conversationHistory
      .filter(msg => msg.role === 'user')
      .map(msg => msg.content.toLowerCase())
      .join(' ');
    
    // Detectar temas principales
    const topics = [];
    if (allMessages.includes('trabajo') || allMessages.includes('laboral')) topics.push('trabajo');
    if (allMessages.includes('familia') || allMessages.includes('pareja')) topics.push('relaciones');
    if (allMessages.includes('ansiedad') || allMessages.includes('estres')) topics.push('ansiedad');
    if (allMessages.includes('triste') || allMessages.includes('depresion')) topics.push('estado_de_animo');
    if (allMessages.includes('sueno') || allMessages.includes('dormir')) topics.push('sueño');
    
    // Detectar sentimiento general
    const positiveWords = ['bien', 'feliz', 'alegre', 'contento', 'gracias', 'mejor'];
    const negativeWords = ['mal', 'triste', 'ansioso', 'estresado', 'preocupado', 'horrible'];
    
    const positiveCount = positiveWords.filter(word => allMessages.includes(word)).length;
    const negativeCount = negativeWords.filter(word => allMessages.includes(word)).length;
    
    let sentiment = 'neutral';
    if (positiveCount > negativeCount) sentiment = 'positive';
    else if (negativeCount > positiveCount) sentiment = 'negative';
    
    return {
      sentiment,
      topics,
      mood: sentiment === 'negative' ? 'concerning' : 'stable',
      recommendations: [
        'Continuar con las sesiones regulares',
        'Practicar técnicas aprendidas',
        'Aplicar estrategias en la vida diaria'
      ]
    };
    
  } catch (error) {
    console.error('Error analizando conversación:', error);
    return {
      sentiment: 'unknown',
      topics: [],
      mood: 'stable',
      recommendations: []
    };
  }
};

module.exports = {
  generateResponse,
  detectCrisisLevel,
  generateCrisisResponse,
  analyzeConversation
};
