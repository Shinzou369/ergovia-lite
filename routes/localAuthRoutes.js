const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { hashPassword, verifyPassword, validatePassword, validateEmail } = require('../utils/passwordUtils');

let etfDB;

function setDatabase(db) {
  etfDB = db;
}

router.post('/signup', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and password are required' 
      });
    }

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return res.status(400).json({ 
        success: false, 
        error: emailValidation.error 
      });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ 
        success: false, 
        error: passwordValidation.error 
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    etfDB.get('SELECT id, role FROM users WHERE email = ?', [normalizedEmail], async (err, existingUser) => {
      if (err) {
        console.error('Database error during signup:', err);
        return res.status(500).json({ 
          success: false, 
          error: 'Registration failed. Please try again.' 
        });
      }

      if (existingUser) {
        const requestedRole = role || 'client';
        const existingRole = existingUser.role || 'client';
        
        if (existingRole === requestedRole) {
          return res.status(400).json({ 
            success: false, 
            error: 'An account with this email already exists. Please login instead.' 
          });
        } else {
          const roleNames = {
            'affiliate': 'affiliate',
            'client': 'client'
          };
          return res.status(400).json({ 
            success: false, 
            error: `This email is already registered as a ${roleNames[existingRole]}. You cannot use the same email for both affiliate and client accounts. Please use a different email address.` 
          });
        }
      }

      try {
        const passwordHash = await hashPassword(password);
        const userId = uuidv4();

        etfDB.run(
          'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)',
          [userId, normalizedEmail, passwordHash, name || null, role || 'client'],
          function(insertErr) {
            if (insertErr) {
              console.error('Error creating user:', insertErr);
              return res.status(500).json({ 
                success: false, 
                error: 'Registration failed. Please try again.' 
              });
            }

            const user = {
              id: userId,
              email: normalizedEmail,
              name: name || null,
              role: role || 'client' // Default to client role
            };

            req.session.user = user;
            req.user = user;

            req.session.save((saveErr) => {
              if (saveErr) {
                console.error('Session save error:', saveErr);
              }

              console.log('✅ User registered successfully:', normalizedEmail);
              
              res.json({ 
                success: true,
                message: 'Account created successfully',
                user: {
                  id: user.id,
                  email: user.email,
                  name: user.name
                }
              });
            });
          }
        );
      } catch (hashError) {
        console.error('Password hashing error:', hashError);
        return res.status(500).json({ 
          success: false, 
          error: 'Registration failed. Please try again.' 
        });
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'An unexpected error occurred' 
    });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and password are required' 
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    etfDB.get(
      'SELECT id, email, password_hash, name, role FROM users WHERE email = ?',
      [normalizedEmail],
      async (err, user) => {
        if (err) {
          console.error('Database error during login:', err);
          return res.status(500).json({ 
            success: false, 
            error: 'Login failed. Please try again.' 
          });
        }

        if (!user) {
          return res.status(401).json({ 
            success: false, 
            error: 'Invalid email or password' 
          });
        }

        try {
          const isValidPassword = await verifyPassword(password, user.password_hash);

          if (!isValidPassword) {
            return res.status(401).json({ 
              success: false, 
              error: 'Invalid email or password' 
            });
          }

          req.session.regenerate((regenerateErr) => {
            if (regenerateErr) {
              console.error('Session regeneration error:', regenerateErr);
              return res.status(500).json({ 
                success: false, 
                error: 'Login failed. Please try again.' 
              });
            }

            const sessionUser = {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role || 'client'
            };

            req.session.user = sessionUser;
            req.user = sessionUser;

            req.session.save((saveErr) => {
              if (saveErr) {
                console.error('Session save error:', saveErr);
              }

              console.log('✅ User logged in successfully:', user.email);

              res.json({ 
                success: true,
                message: 'Login successful',
                user: {
                  id: sessionUser.id,
                  email: sessionUser.email,
                  name: sessionUser.name,
                  role: sessionUser.role
                }
              });
            });
          });
        } catch (verifyError) {
          console.error('Password verification error:', verifyError);
          return res.status(500).json({ 
            success: false, 
            error: 'Login failed. Please try again.' 
          });
        }
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'An unexpected error occurred' 
    });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ 
        success: false, 
        error: 'Logout failed' 
      });
    }

    res.clearCookie('ergovia.sid');
    res.json({ 
      success: true, 
      message: 'Logged out successfully' 
    });
  });
});

module.exports = { router, setDatabase };
