const express = require('express');
const authController = require('../controllers/authController');
const { authMiddleware, adminOnly } = require('../middlewares/auth');

const router = express.Router();

/** Boş DB — ilkinji admin (auth hökmany däl) */
router.get('/setup-status', authController.setupStatus);
router.post('/bootstrap', authController.bootstrap);
/** Brauzerde GET açylsa — näme etmelidigini görkez */
router.get('/bootstrap', async (req, res, next) => {
  try {
    const status = await require('../services/authService').getSetupStatus();
    res.json({
      success: true,
      message: 'Bu endpoint diňe POST bilen işleýär (Swagger → Try it out).',
      data: {
        ...status,
        howTo: status.needsSetup
          ? 'Swagger-de Auth → POST /api/auth/bootstrap → Try it out → Execute'
          : 'Ulanyjy eýýäm bar. POST /api/auth/login bilen giriň.',
        exampleBody: { username: 'admin', password: 'admin123', fullName: 'Administrator' },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', authController.login);
router.get('/profile', authMiddleware, authController.profile);
router.get('/staff', authMiddleware, authController.listStaff);

router.get('/users', authMiddleware, adminOnly, authController.listUsers);
router.post('/users', authMiddleware, adminOnly, authController.createUser);
router.get('/users/:id', authMiddleware, adminOnly, authController.getUser);
router.put('/users/:id', authMiddleware, adminOnly, authController.updateUser);
router.delete('/users/:id', authMiddleware, adminOnly, authController.deleteUser);

module.exports = router;
