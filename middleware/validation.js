const Joi = require('joi');

// Esquema para validación de registro
const registerSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .pattern(/^[a-zA-ZáéíóúñÑ\s]+$/)
    .required()
    .messages({
      'string.pattern.base': 'El nombre solo puede contener letras y espacios',
      'string.min': 'El nombre debe tener al menos 2 caracteres',
      'string.max': 'El nombre no puede exceder 100 caracteres',
      'any.required': 'El nombre es requerido'
    }),
  
  email: Joi.string()
    .email()
    .lowercase()
    .trim()
    .required()
    .messages({
      'string.email': 'Por favor ingresa un email válido',
      'any.required': 'El email es requerido'
    }),
  
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.min': 'La contraseña debe tener al menos 8 caracteres',
      'string.max': 'La contraseña no puede exceder 128 caracteres',
      'string.pattern.base': 'La contraseña debe incluir al menos una minúscula, una mayúscula, un número y un carácter especial',
      'any.required': 'La contraseña es requerida'
    }),
  
  age: Joi.number()
    .integer()
    .min(13)
    .max(120)
    .optional()
    .messages({
      'number.min': 'Debes ser mayor de 13 años',
      'number.max': 'La edad no puede exceder 120 años',
      'number.base': 'La edad debe ser un número válido'
    }),
  
  gender: Joi.string()
    .valid('male', 'female', 'non-binary', 'prefer-not-to-say')
    .optional()
    .messages({
      'any.only': 'Género debe ser: male, female, non-binary, o prefer-not-to-say'
    }),
  
  timezone: Joi.string()
    .optional()
    .default('America/Bogota'),
  
  preferences: Joi.object({
    therapyStyle: Joi.string()
      .valid('cognitive', 'behavioral', 'humanistic', 'integrated')
      .optional(),
    
    communicationStyle: Joi.string()
      .valid('supportive', 'direct', 'humorous', 'mindful')
      .optional(),
    
    language: Joi.string()
      .valid('es', 'en', 'pt')
      .optional(),
    
    crisisSupport: Joi.boolean()
      .optional(),
    
    notificationSettings: Joi.object({
      pushEnabled: Joi.boolean().optional(),
      emailEnabled: Joi.boolean().optional(),
      frequency: Joi.string()
        .valid('immediate', 'daily', 'weekly', 'monthly')
        .optional()
    }).optional()
  }).optional()
});

// Esquema para validación de inicio de sesión
const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .lowercase()
    .trim()
    .required()
    .messages({
      'string.email': 'Por favor ingresa un email válido',
      'any.required': 'El email es requerido'
    }),
  
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'La contraseña es requerida'
    })
});

// Esquema para validación de chat
const chatSchema = Joi.object({
  message: Joi.string()
    .trim()
    .min(1)
    .max(2000)
    .required()
    .messages({
      'string.min': 'El mensaje no puede estar vacío',
      'string.max': 'El mensaje no puede exceder 2000 caracteres',
      'any.required': 'El mensaje es requerido'
    }),
  
  context: Joi.object({
    currentMood: Joi.number()
      .min(1)
      .max(10)
      .optional(),
    
    situation: Joi.string()
      .max(500)
      .optional(),
    
    isCrisis: Joi.boolean()
      .optional()
  }).optional()
});

// Esquema para validación de actualización de perfil
const updateProfileSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .pattern(/^[a-zA-ZáéíóúñÑ\s]+$/)
    .optional()
    .messages({
      'string.pattern.base': 'El nombre solo puede contener letras y espacios',
      'string.min': 'El nombre debe tener al menos 2 caracteres',
      'string.max': 'El nombre no puede exceder 100 caracteres'
    }),
  
  age: Joi.number()
    .integer()
    .min(13)
    .max(120)
    .optional()
    .messages({
      'number.min': 'Debes ser mayor de 13 años',
      'number.max': 'La edad no puede exceder 120 años',
      'number.base': 'La edad debe ser un número válido'
    }),
  
  gender: Joi.string()
    .valid('male', 'female', 'non-binary', 'prefer-not-to-say')
    .optional()
    .messages({
      'any.only': 'Género debe ser: male, female, non-binary, o prefer-not-to-say'
    }),
  
  timezone: Joi.string()
    .optional(),
  
  preferences: Joi.object({
    therapyStyle: Joi.string()
      .valid('cognitive', 'behavioral', 'humanistic', 'integrated')
      .optional(),
    
    communicationStyle: Joi.string()
      .valid('supportive', 'direct', 'humorous', 'mindful')
      .optional(),
    
    language: Joi.string()
      .valid('es', 'en', 'pt')
      .optional(),
    
    crisisSupport: Joi.boolean()
      .optional(),
    
    notificationSettings: Joi.object({
      pushEnabled: Joi.boolean().optional(),
      emailEnabled: Joi.boolean().optional(),
      frequency: Joi.string()
        .valid('immediate', 'daily', 'weekly', 'monthly')
        .optional()
    }).optional()
  }).optional()
});

// Esquema para validación de cambio de contraseña
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string()
    .required()
    .messages({
      'any.required': 'La contraseña actual es requerida'
    }),
  
  newPassword: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.min': 'La nueva contraseña debe tener al menos 8 caracteres',
      'string.max': 'La nueva contraseña no puede exceder 128 caracteres',
      'string.pattern.base': 'La nueva contraseña debe incluir al menos una minúscula, una mayúscula, un número y un carácter especial',
      'any.required': 'La nueva contraseña es requerida'
    })
});

// Esquema para validación de entrada de estado de ánimo
const moodEntrySchema = Joi.object({
  mood: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .required()
    .messages({
      'number.min': 'El estado de ánimo debe estar entre 1 y 10',
      'number.max': 'El estado de ánimo debe estar entre 1 y 10',
      'any.required': 'El estado de ánimo es requerido'
    }),
  
  context: Joi.string()
    .max(500)
    .optional()
    .messages({
      'string.max': 'El contexto no puede exceder 500 caracteres'
    })
});

// Middleware de validación genérico
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Mostrar todos los errores
      stripUnknown: true, // Remover campos no definidos en el schema
      convert: true // Intentar convertir tipos cuando sea posible
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: errors
      });
    }
    
    // Reemplazar req.body con los datos validados
    req.body = value;
    next();
  };
};

// Middleware para validar query parameters
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        error: 'Parámetros de consulta inválidos',
        details: errors
      });
    }
    
    req.query = value;
    next();
  };
};

// Middleware para validar parámetros de URL
const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        error: 'Parámetros de URL inválidos',
        details: errors
      });
    }
    
    req.params = value;
    next();
  };
};

// Middleware específicos para cada endpoint
const validateRegister = validate(registerSchema);
const validateLogin = validate(loginSchema);
const validateChat = validate(chatSchema);
const validateUpdateProfile = validate(updateProfileSchema);
const validateChangePassword = validate(changePasswordSchema);
const validateMoodEntry = validate(moodEntrySchema);

module.exports = {
  validate,
  validateQuery,
  validateParams,
  validateRegister,
  validateLogin,
  validateChat,
  validateUpdateProfile,
  validateChangePassword,
  validateMoodEntry
};
