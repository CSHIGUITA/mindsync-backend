const express = require('express');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const logger = require('../logger');

const router = express.Router();

// Helper function to validate basic requirements
const validateBasic = (data, requiredFields) => {
  for (const field of requiredFields) {
    if (!data[field] || data[field].trim() === '') {
      return `${field} is required`;
    }
  }
  return null;
};

// Helper function to get username from request
const getUsername = (req) => {
  return req.body.name || req.body.username || 'Usuario';
};

// Register new user
router.post('/register', async (req, res) => {
  console.log('=== REGISTER DEBUG ===');
  console.log('req.body:', JSON.stringify(req.body, null, 2));
  console.log('req.headers:', JSON.stringify(req.headers, null, 2));
  console.log('req.ip:', req.ip);
  console.log('========================');
  
  try {
    const { name, email, password, userType } = req.body;
    
    // Basic validation
    const validationError = validateBasic({ name, email, password }, ['name', 'email', 'password']);
    if (validationError) {
      return res.status(400).json({
        error: `Missing required field: ${validationError}`
      });
    }
    
    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format'
      });
    }
    
    // Password length validation
    if (password.length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters'
      });
    }
    
    const username = getUsername(req);
    console.log('✅ USERNAME ACEPTADO (name O username):', username);
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.log('❌ USUARIO YA EXISTE:', email.toLowerCase(), username);
      return res.status(400).json({
        error: 'Este email ya está registrado. Usa otro email o inicia sesión.'
      });
    }
    
    // Create new user
    const user = new User({
      username: username.toLowerCase().trim(),
      email: email.toLowerCase(),
      password,
      userType: userType || 'student',
      stats: {
        totalSessions: 0,
        totalMessages: 0,
        moodAverage: 0,
        daysTracked: 0,
        lastActivity: new Date()
      }
    });
    
    await user.save();
    
    // Generate tokens
    const tokens = generateTokens(user._id);
    
    console.log('✅ USUARIO REGISTRADO EXITOSAMENTE');
    console.log('Username:', username.toLowerCase().trim());
    console.log('Email:', email.toLowerCase());
    
    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: user.toJSON(),
      tokens
    });
    
  } catch (error) {
    console.log('📝 REGISTRATION ERROR:', error.message);
    logger.error('Registration error:', error);
    
    // Handle duplicate email error
    if (error.code === 11000) {
      return res.status(400).json({
        error: 'Este email ya está registrado'
      });
    }
    
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// Login user
router.post('/login', async (req, res) => {
  console.log('=== LOGIN DEBUG ===');
  console.log('req.body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { email, password } = req.body;
    
    // Basic validation
    const validationError = validateBasic({ email, password }, ['email', 'password']);
    if (validationError) {
      return res.status(400).json({
        error: `Missing required field: ${validationError}`
      });
    }
    
    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format'
      });
    }
    
    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({
        error: 'Credenciales inválidas'
      });
    }
    
    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Credenciales inválidas'
      });
    }
    
    // Generate tokens
    const tokens = generateTokens(user._id);
    
    console.log('✅ LOGIN EXITOSO');
    
    const loginResponse = {
      message: 'Inicio de sesión exitoso',
      user: user.toJSON(),
      tokens
    };
    
    console.log('📝 LOGIN RESPONSE TO SEND:', loginResponse);
    console.log('📝 Tokens structure:', tokens);
    console.log('📝 Access token length:', tokens.accessToken?.length);
    
    res.json(loginResponse);
    
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// Generate JWT tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId, type: 'access' },
    process.env.JWT_SECRET || 'default-secret',
    { expiresIn: '15m' }
  );
  
  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
    { expiresIn: '7d' }
  );
  
  return { accessToken, refreshToken };
};

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

module.exports = router;
