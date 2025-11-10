const express = require('express');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const logger = require('winston');
const router = express.Router();
// Validation schemas
const registerSchema = Joi.object({
name: Joi.string().min(2).max(100).required(),
email: Joi.string().email().required(),
password: Joi.string().min(6).max(128).required(),
userType: Joi.string().valid('free', 'student', 'professional').default('student')
});
const loginSchema = Joi.object({
email: Joi.string().email().required(),
password: Joi.string().required()
});
const refreshTokenSchema = Joi.object({
refreshToken: Joi.string().required()
});
// CORRECCIÓN: Validación robusta de variables de entorno
const getJWTConfig = () => {
const jwtSecret = process.env.JWT_SECRET;
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
logger.info('Validando variables JWT:');
logger.info('JWT_SECRET existe:', !!jwtSecret);
logger.info('JWT_SECRET length:', jwtSecret ? jwtSecret.length : 0);
logger.info('JWT_REFRESH_SECRET existe:', !!jwtRefreshSecret);
logger.info('JWT_REFRESH_SECRET length:', jwtRefreshSecret ? jwtRefreshSecret.length : 0);
if (!jwtSecret || jwtSecret.trim() === '') {
logger.error('JWT_SECRET está vacío o no está definido');
throw new Error('Configuración JWT inválida: JWT_SECRET faltante');
}
if (!jwtRefreshSecret || jwtRefreshSecret.trim() === '') {
logger.error('JWT_REFRESH_SECRET está vacío o no está definido');
throw new Error('Configuración JWT inválida: JWT_REFRESH_SECRET faltante');
}
return {
accessSecret: jwtSecret,
refreshSecret: jwtRefreshSecret
};
};
// Generate JWT tokens
const generateTokens = (userId) => {
try {
const config = getJWTConfig();
const accessToken = jwt.sign(
{ userId, type: 'access' },
config.accessSecret,
{ expiresIn: '15m' }
);
const refreshToken = jwt.sign(
{ userId, type: 'refresh' },
config.refreshSecret,
{ expiresIn: '7d' }
);
logger.info('Tokens generados exitosamente para userId:', userId);
return { accessToken, refreshToken };
} catch (error) {
logger.error('Error generando tokens:', error);
throw error;
}
};
// Register new user
router.post('/register', validateRequest(registerSchema), async (req, res) => {
try {
const { name, email, password, userType } = req.body;
logger.info('Iniciando registro para email:', email);
// Check if user already exists
const existingUser = await User.findOne({ email: email.toLowerCase() });
if (existingUser) {
return res.status(400).json({
error: 'Este email ya está registrado. Usa otro email o inicia sesión.'
});
}
// Create new user
const user = new User({
name,
email: email.toLowerCase(),
password,
userType,
subscription: {
plan: userType === 'free' ? 'free' : userType,
features: userType === 'free' ? undefined : undefined // Will be set by getSubscriptionFeatures
}
});
await user.save();
logger.info('Usuario creado exitosamente:', user._id);
// Generate tokens
const tokens = generateTokens(user._id);
// Log registration
logger.info(`New user registered: ${email}`, {
userId: user._id,
userType,
ip: req.ip
});
res.status(201).json({
message: 'Usuario registrado exitosamente',
user: user.toJSON(),
tokens
});
} catch (error) {
logger.error('Registration error:', error);
// Handle duplicate email error
if (error.code === 11000) {
return res.status(400).json({
error: 'Este email ya está registrado'
});
}
// Handle JWT configuration error
if (error.message.includes('Configuración JWT inválida')) {
return res.status(500).json({
error: 'Error de configuración del servidor',
details: 'Variables de entorno JWT no configuradas correctamente'
});
}
res.status(500).json({
error: 'Error interno del servidor'
});
}
});
// Login user
router.post('/login', validateRequest(loginSchema), async (req, res) => {
try {
const { email, password } = req.body;
// Find user
const user = await User.findOne({ email: email.toLowerCase() });
if (!user) {
return res.status(401).json({
error: 'Credenciales inválidas'
});
}
// Check if account is locked
if (user.isLocked) {
return res.status(423).json({
error: 'Cuenta bloqueada temporalmente por intentos fallidos'
});
}
// Check password
const isPasswordValid = await user.comparePassword(password);
if (!isPasswordValid) {
await user.incLoginAttempts();
logger.warn('Failed login attempt', {
email,
ip: req.ip,
attempts: user.security.loginAttempts + 1
});
return res.status(401).json({
error: 'Credenciales inválidas'
});
}
// Reset login attempts on successful login
if (user.security.loginAttempts > 0) {
await user.resetLoginAttempts();
}
// Update last login
await user.updateOne({
'security.lastLogin': new Date(),
'stats.lastActivity': new Date()
});
// Generate tokens
const tokens = generateTokens(user._id);
// Log successful login
logger.info(`User logged in successfully: ${email}`, {
userId: user._id,
ip: req.ip
});
res.json({
message: 'Inicio de sesión exitoso',
user: user.toJSON(),
tokens
});
} catch (error) {
logger.error('Login error:', error);
// Handle JWT configuration error
if (error.message.includes('Configuración JWT inválida')) {
return res.status(500).json({
error: 'Error de configuración del servidor',
details: 'Variables de entorno JWT no configuradas correctamente'
});
}
res.status(500).json({
error: 'Error interno del servidor'
});
}
});
// Refresh token
router.post('/refresh', validateRequest(refreshTokenSchema), async (req, res) => {
try {
const { refreshToken } = req.body;
// Verify refresh token
const config = getJWTConfig();
const decoded = jwt.verify(refreshToken, config.refreshSecret);
// Find user
const user = await User.findById(decoded.userId);
if (!user) {
return res.status(401).json({
error: 'Usuario no encontrado'
});
}
// Generate new tokens
const tokens = generateTokens(user._id);
res.json({
tokens,
user: user.toJSON()
});
} catch (error) {
if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
return res.status(401).json({
error: 'Token inválido o expirado'
});
}
logger.error('Refresh token error:', error);
res.status(500).json({
error: 'Error interno del servidor'
});
}
});
// Get current user
router.get('/me', authenticate, async (req, res) => {
try {
const user = await User.findById(req.userId);
if (!user) {
return res.status(404).json({
error: 'Usuario no encontrado'
});
}
res.json({
user: user.toJSON()
});
} catch (error) {
logger.error('Get user error:', error);
res.status(500).json({
error: 'Error interno del servidor'
});
}
});
// Update user profile
router.patch('/profile', authenticate, async (req, res) => {
try {
const allowedUpdates = ['name', 'profile', 'preferences', 'emergency'];
const updates = Object.keys(req.body);
const isValidOperation = updates.every(update => allowedUpdates.includes(update));
if (!isValidOperation) {
return res.status(400).json({
error: 'Campos no válidos para actualización'
});
}
const user = await User.findById(req.userId);
if (!user) {
return res.status(404).json({
error: 'Usuario no encontrado'
});
}
// Update fields
updates.forEach(update => user[update] = req.body[update]);
user.stats.lastActivity = new Date();
await user.save();
logger.info(`User profile updated: ${user.email}`, {
userId: user._id,
updates
});
res.json({
message: 'Perfil actualizado exitosamente',
user: user.toJSON()
});
} catch (error) {
logger.error('Update profile error:', error);
res.status(500).json({
error: 'Error interno del servidor'
});
}
});
// Change password
router.post('/change-password', authenticate, async (req, res) => {
try {
const { currentPassword, newPassword } = req.body;
if (!currentPassword || !newPassword) {
return res.status(400).json({
error: 'Contraseña actual y nueva son requeridas'
});
}
const user = await User.findById(req.userId);
if (!user) {
return res.status(404).json({
error: 'Usuario no encontrado'
});
}
// Verify current password
const isCurrentPasswordValid = await user.comparePassword(currentPassword);
if (!isCurrentPasswordValid) {
return res.status(400).json({
error: 'Contraseña actual incorrecta'
});
}
// Validate new password
if (newPassword.length < 6) {
return res.status(400).json({
error: 'La nueva contraseña debe tener al menos 6 caracteres'
});
}
// Update password
user.password = newPassword;
await user.save();
logger.info(`Password changed for user: ${user.email}`, {
userId: user._id
});
res.json({
message: 'Contraseña actualizada exitosamente'
});
} catch (error) {
logger.error('Change password error:', error);
res.status(500).json({
error: 'Error interno del servidor'
});
}
});
// Logout (client-side token removal, server-side logging)
router.post('/logout', authenticate, (req, res) => {
logger.info(`User logged out: ${req.userId}`);
res.json({
message: 'Sesión cerrada exitosamente'
});
});
// Delete account
router.delete('/account', authenticate, async (req, res) => {
try {
const { password } = req.body;
const user = await User.findById(req.userId);
if (!user) {
return res.status(404).json({
error: 'Usuario no encontrado'
});
}
// Verify password for account deletion
const isPasswordValid = await user.comparePassword(password);
if (!isPasswordValid) {
return res.status(400).json({
error: 'Contraseña incorrecta'
});
}
// Soft delete - mark as inactive instead of deleting
await user.updateOne({
isActive: false,
deletedAt: new Date()
});
logger.info(`Account deleted: ${user.email}`, {
userId: user._id
});
res.json({
message: 'Cuenta eliminada exitosamente'
});
} catch (error) {
logger.error('Delete account error:', error);
res.status(500).json({
error: 'Error interno del servidor'
});
}
});
module.exports = router;
