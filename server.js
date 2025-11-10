const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
require('dotenv').config();
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const progressRoutes = require('./routes/progress');
// Configuración de logger
const logger = winston.createLogger({
level: 'info',
format: winston.format.combine(
winston.format.timestamp(),
winston.format.json()
),
transports: [
new winston.transports.Console(),
new winston.transports.File({ filename: 'error.log', level: 'error' }),
new winston.transports.File({ filename: 'combined.log' })
]
});
const app = express();
const PORT = process.env.PORT || 3000;
// CORRECCIÓN 1: Configurar trust proxy para Railway
app.set('trust proxy', 1);
// CORS configuración corregida - permite cualquier origen
app.use(cors({
origin: '*', // Permitir cualquier origen
credentials: true
}));
// Middleware de seguridad
app.use(helmet());
// Rate limiting
const limiter = rateLimit({
windowMs: 15 * 60 * 1000, // 15 minutos
max: 100, // máximo 100 requests por IP
message: 'Demasiadas solicitudes desde esta IP, intenta de nuevo más tarde.',
// CORRECCIÓN 2: Agregar configuración para proxies
standardHeaders: true,
legacyHeaders: false,
keyGenerator: (req) => {
// Usar IP real del cliente
return req.ip || req.connection.remoteAddress || 'unknown';
}
});
app.use(limiter);
// Middleware general
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// CORRECCIÓN 3: Log de variables de entorno importantes
logger.info('Variables de entorno cargadas:');
logger.info('MONGODB_URI existe:', !!process.env.MONGODB_URI);
logger.info('JWT_SECRET existe:', !!process.env.JWT_SECRET);
logger.info('JWT_REFRESH_SECRET existe:', !!process.env.JWT_REFRESH_SECRET);
logger.info('OPENAI_API_KEY existe:', !!process.env.OPENAI_API_KEY);
// Conectar a MongoDB
mongoose.connect(process.env.MONGODB_URI, {
useNewUrlParser: true,
useUnifiedTopology: true,
})
.then(() => {
logger.info('Conectado a MongoDB Atlas');
})
.catch((err) => {
logger.error('Error conectando a MongoDB:', err);
process.exit(1);
});
// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/progress', progressRoutes);
// Ruta de salud
app.get('/health', (req, res) => {
res.json({ 
status: 'OK', 
message: 'MindSync API está funcionando',
timestamp: new Date().toISOString()
});
});
// Ruta por defecto
app.get('/', (req, res) => {
res.json({
message: 'MindSync Mental Health API',
version: '1.0.0',
endpoints: {
auth: '/api/auth',
chat: '/api/chat', 
progress: '/api/progress',
health: '/health'
}
});
});
// Middleware de manejo de errores
app.use((err, req, res, next) => {
logger.error('Error en el servidor:', err.message);
logger.error('Stack trace:', err.stack);
res.status(500).json({
error: 'Error interno del servidor',
message: process.env.NODE_ENV === 'development' ? err.message : 'Algo salió mal'
});
});
// Manejo de 404
app.use('*', (req, res) => {
res.status(404).json({ error: 'Ruta no encontrada' });
});
// Iniciar servidor
app.listen(PORT, () => {
logger.info(`Servidor MindSync ejecutándose en puerto ${PORT}`);
logger.info(`Entorno: ${process.env.NODE_ENV || 'development'}`);
logger.info('Proxy trust configurado para Railway');
});
module.exports = app;
