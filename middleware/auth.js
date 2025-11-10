const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware para verificar token JWT (bearer token)
const auth = async (req, res, next) => {
  try {
    // Obtener token del header Authorization
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'Token de acceso requerido. No se proporcionó token.' 
      });
    }

    // Verificar formato del token
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Formato de token inválido. Use: Bearer <token>' 
      });
    }

    // Extraer token (quitar "Bearer ")
    const token = authHeader.substring(7);

    if (!token) {
      return res.status(401).json({ 
        error: 'Token de acceso requerido.' 
      });
    }

    // Verificar y decodificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Buscar usuario en la base de datos
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Token inválido. Usuario no encontrado.' 
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ 
        error: 'Cuenta desactivada. Contacta al soporte.' 
      });
    }

    // Agregar usuario al objeto request
    req.user = {
      userId: user._id,
      email: user.email,
      subscriptionPlan: user.subscriptionPlan,
      canStartSession: user.canStartSession()
    };

    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Token de acceso inválido.' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token de acceso expirado. Por favor inicia sesión nuevamente.' 
      });
    }

    console.error('Error en middleware de autenticación:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
};

// Middleware para verificar refresh token
const refreshTokenAuth = async (req, res, next) => {
  try {
    // Obtener refresh token del body
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ 
        error: 'Refresh token requerido.' 
      });
    }

    // Verificar refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    // Buscar usuario
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Usuario no encontrado.' 
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ 
        error: 'Cuenta desactivada.' 
      });
    }

    // Agregar información del usuario al request
    req.user = {
      userId: user._id
    };

    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Refresh token inválido.' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Refresh token expirado. Inicia sesión nuevamente.' 
      });
    }

    console.error('Error en middleware de refresh token:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
};

// Middleware para verificar plan de suscripción premium
const requirePremium = (req, res, next) => {
  if (req.user.subscriptionPlan !== 'premium') {
    return res.status(403).json({ 
      error: 'Esta funcionalidad requiere suscripción premium.' 
    });
  }
  next();
};

// Middleware para verificar si el usuario puede iniciar sesión
const checkSessionLimit = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user.canStartSession()) {
      return res.status(429).json({
        error: 'Límite de sesiones alcanzado para tu plan actual.',
        subscriptionPlan: user.subscriptionPlan,
        currentSessions: user.stats.sessionsThisWeek
      });
    }
    
    next();
  } catch (error) {
    console.error('Error verificando límite de sesiones:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Middleware para verificar verificación de email
const requireEmailVerification = (req, res, next) => {
  // Esta funcionalidad se puede implementar más adelante
  // Por ahora, la saltamos
  next();
};

module.exports = {
  auth,
  refreshTokenAuth,
  requirePremium,
  checkSessionLimit,
  requireEmailVerification
};
