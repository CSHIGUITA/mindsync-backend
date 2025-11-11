const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Importar modelo User
const User = require('../models/User');

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido' });
    }

    req.user = user;
    next();
  });
};

// Rutas de autenticación
router.post('/register', async (req, res) => {
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
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/login', async (req, res) => {
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
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
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
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/refresh', async (req, res) => {
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
    console.error('Error en refresh:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
