require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const winston = require('winston');
const path = require('path');

// Inicializar la aplicación
const app = express();

// ✅ CORRECCIÓN CLAVE: Configurar trust proxy para Railway
app.set('trust proxy', 1);

// Configuración del logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Middleware para logging de requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// Configurar rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limitar cada IP a 100 requests por ventana
  message: {
    error: 'Demasiadas requests desde esta IP, intenta de nuevo en 15 minutos.'
  },
  standardHeaders: true, // Retornar información del rate limit en `RateLimit-*` headers
  legacyHeaders: false, // Deshabilitar los headers `X-RateLimit-*`
  keyGenerator: (req) => {
    // Usar la IP real del cliente (con trust proxy configurado)
    return req.ip;
  }
});

// Aplicar rate limiting a todas las rutas
app.use(limiter);

// Middleware para CORS
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware para parsing JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Conexión a MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mindsync', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => logger.info('Conectado a MongoDB'))
.catch(err => {
  logger.error('Error conectando a MongoDB:', err);
  process.exit(1);
});

// Verificar variables de entorno críticas
if (!process.env.JWT_SECRET) {
  logger.error('JWT_SECRET no está definido en las variables de entorno');
  process.exit(1);
}

// Modelos de Mongoose
const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    lowercase: true
  },
  password: { 
    type: String, 
    required: true,
    minlength: 6
  },
  isFirstLogin: { 
    type: Boolean, 
    default: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  // Estadísticas del usuario
  totalSessions: { 
    type: Number, 
    default: 0 
  },
  totalMessages: { 
    type: Number, 
    default: 0 
  },
  lastActivity: { 
    type: Date, 
    default: Date.now 
  },
  moodAverage: { 
    type: Number, 
    default: 0 
  },
  daysTracked: { 
    type: Number, 
    default: 0 
  }
});

const User = mongoose.model('User', userSchema);

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      logger.error('Error verificando token:', err.message);
      return res.status(403).json({ error: 'Token inválido' });
    }

    req.user = user;
    next();
  });
};

// Rutas de autenticación
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validaciones
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({ 
        error: existingUser.email === email 
          ? 'El email ya está registrado' 
          : 'El nombre de usuario ya está en uso' 
      });
    }

    // Hash de la contraseña
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Crear nuevo usuario
    const newUser = new User({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword
    });

    await newUser.save();

    // Generar tokens
    const accessToken = jwt.sign(
      { 
        userId: newUser._id, 
        username: newUser.username 
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { 
        userId: newUser._id, 
        username: newUser.username 
      },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    logger.info(`Nuevo usuario registrado: ${newUser.username} (${newUser.email})`);

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        isFirstLogin: newUser.isFirstLogin
      },
      tokens: {
        accessToken,
        refreshToken
      }
    });

  } catch (error) {
    logger.error('Error en registro:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validaciones
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }

    // Buscar usuario por email
    const user = await User.findOne({ 
      email: email.trim().toLowerCase() 
    });

    if (!user) {
      return res.status(400).json({ error: 'Credenciales inválidas' });
    }

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Credenciales inválidas' });
    }

    // Actualizar último login
    user.lastActivity = new Date();
    await user.save();

    // Generar tokens
    const accessToken = jwt.sign(
      { 
        userId: user._id, 
        username: user.username 
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { 
        userId: user._id, 
        username: user.username 
      },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    logger.info(`Usuario logueado: ${user.username}`);

    res.json({
      message: 'Login exitoso',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isFirstLogin: user.isFirstLogin
      },
      tokens: {
        accessToken,
        refreshToken
      }
    });

  } catch (error) {
    logger.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isFirstLogin: user.isFirstLogin,
        totalSessions: user.totalSessions,
        totalMessages: user.totalMessages,
        lastActivity: user.lastActivity,
        moodAverage: user.moodAverage,
        daysTracked: user.daysTracked
      }
    });

  } catch (error) {
    logger.error('Error obteniendo perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token requerido' });
    }

    // Verificar refresh token
    jwt.verify(
      refreshToken, 
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      async (err, userData) => {
        if (err) {
          return res.status(403).json({ error: 'Refresh token inválido' });
        }

        // Verificar que el usuario aún existe
        const user = await User.findById(userData.userId);
        if (!user) {
          return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Generar nuevo access token
        const newAccessToken = jwt.sign(
          { 
            userId: user._id, 
            username: user.username 
          },
          process.env.JWT_SECRET,
          { expiresIn: '15m' }
        );

        res.json({
          accessToken: newAccessToken
        });
      }
    );

  } catch (error) {
    logger.error('Error en refresh:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Importar rutas
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const progressRoutes = require('./routes/progress');

// Usar rutas
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/progress', progressRoutes);

// Ruta de salud
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Ruta por defecto
app.get('/', (req, res) => {
  res.json({ 
    message: 'MindSync Backend API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      chat: '/api/chat',
      progress: '/api/progress'
    }
  });
});

// Manejo de errores 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

// Manejo de errores globales
app.use((err, req, res, next) => {
  logger.error('Error no manejado:', err);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Algo salió mal'
  });
});

// Configuración del puerto
const PORT = process.env.PORT || 3000;

// Iniciar servidor
app.listen(PORT, () => {
  logger.info(`Servidor ejecutándose en puerto ${PORT}`);
  logger.info(`Entorno: ${process.env.NODE_ENV || 'development'}`);
});
