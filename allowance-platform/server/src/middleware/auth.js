function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ message: '로그인이 필요합니다.' });
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (req.session?.user?.role !== 'admin') {
    return res.status(403).json({ message: '관리자 권한이 필요합니다.' });
  }
  return next();
}

function requireFreelancer(req, res, next) {
  if (req.session?.user?.role !== 'freelancer') {
    return res.status(403).json({ message: '프리랜서 권한이 필요합니다.' });
  }
  return next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireFreelancer,
};

