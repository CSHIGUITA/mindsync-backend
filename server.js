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

// Configurar logger personalizado
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

// Importar modelo User
const User = require('./models/User');

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
