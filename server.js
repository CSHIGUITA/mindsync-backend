const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const compression = require('compression');
const slowDown = require('express-slow-down');
const { User } = require('./models/User'); // Importar User model
require('dotenv').config();

// Import routes (solo las que existen actualmente)
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const progressRoutes = require('./routes/progress');
const logger = require('./logger'); // Usar logger personalizado

const app = express();
const PORT = process.env.PORT || 8080;

// ✅ TRUST PROXY para Railway
app.set('trust proxy', 1);

// ✅ CORS configuración completa para Railway
const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (como mobile apps o curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'https://mindsync-backend-production.up.railway.app',
      'http://localhost:3000',
      'http://localhost:8080',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:8080'
    ];
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// ✅ OPTIONS handling preflight
app.options('*', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.status(200).end();
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Demasiadas solicitudes desde esta IP, inténtalo de nuevo más tarde.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Speed limiting for heavy operations
const slowDownMiddleware = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 20, // allow 20 requests per window without delay
  delayMs: 500 // add 500ms delay per request after delayAfter
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"]
    }
  }
}));

app.use(compression());
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply rate limiting
app.use('/api', limiter);
app.use('/api/chat', slowDownMiddleware);

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mindsync', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  logger.info('Connected to MongoDB');
  logger.info(`Servidor ejecutándose en puerto ${PORT}`);
  logger.info(`Entorno: ${process.env.NODE_ENV || 'production'}`);
})
.catch(err => {
  logger.error('MongoDB connection error:', err);
  process.exit(1);
});

// Routes (solo las disponibles)
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/progress', progressRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    error: {
      message: isDevelopment ? err.message : 'Error interno del servidor',
      ...(isDevelopment && { stack: err.stack })
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint no encontrado',
    path: req.originalUrl
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  
  try {
    await mongoose.connection.close();
    logger.info('Database connection closed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`MindSync Backend API running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'production'}`);
});

// Export app for testing
module.exports = app;
