const express = require('express');
const bcrypt = require('bcryptjs');
const { AdminAccount, Freelancer } = require('../models');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { login_id, password } = req.body;
    if (!login_id || !password) {
      return res.status(400).json({ message: '아이디와 비밀번호를 입력해 주세요.' });
    }

    const admin = await AdminAccount.findOne({ where: { login_id } });
    if (admin && (await bcrypt.compare(password, admin.password_hash))) {
      req.session.user = { id: admin.id, role: 'admin', login_id: admin.login_id };
      return res.json({ role: 'admin' });
    }

    const freelancer = await Freelancer.findOne({ where: { login_id } });
    if (freelancer && (await bcrypt.compare(password, freelancer.password_hash))) {
      req.session.user = { id: freelancer.id, role: 'freelancer', login_id: freelancer.login_id };
      return res.json({ role: 'freelancer' });
    }

    return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ message: '로그아웃되었습니다.' });
  });
});

router.get('/me', (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ message: '로그인이 필요합니다.' });
  }
  return res.json({ user: req.session.user });
});

module.exports = router;

