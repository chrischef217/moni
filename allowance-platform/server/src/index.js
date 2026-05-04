const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');

const env = require('./config/env');
const { sequelize, seedDefaults } = require('./models');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const freelancerRoutes = require('./routes/freelancer');
const { requireAuth, requireAdmin, requireFreelancer } = require('./middleware/auth');

const app = express();

app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  })
);
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(
  session({
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: 30 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
    },
  })
);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: '서버가 정상 동작 중입니다.' });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', requireAuth, requireAdmin, adminRoutes);
app.use('/api/freelancer', requireAuth, requireFreelancer, freelancerRoutes);

const clientDistPath = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

app.get(/^\/(?!api).*/, (req, res) => {
  return res.sendFile(path.join(clientDistPath, 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ message: '요청하신 경로를 찾을 수 없습니다.' });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: error.message || '서버 오류가 발생했습니다.' });
});

async function start() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    await seedDefaults();

    app.listen(env.port, () => {
      console.log(`서버 실행 중: http://localhost:${env.port}`);
    });
  } catch (error) {
    console.error('서버 시작 실패:', error);
    process.exit(1);
  }
}

start();

