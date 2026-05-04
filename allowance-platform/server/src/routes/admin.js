const express = require('express');
const bcrypt = require('bcryptjs');
const puppeteer = require('puppeteer');
const { Op } = require('sequelize');
const { z } = require('zod');
const {
  sequelize,
  CompanyInfo,
  AdminAccount,
  Freelancer,
  Client,
  Product,
  PayRecord,
  PayDetail,
  SystemConfig,
} = require('../models');
const { encryptText, decryptText, maskRrn } = require('../utils/crypto');
const { calculatePay } = require('../services/payCalculator');
const { calcPaymentDate, renderStatementHtml } = require('../services/statementTemplate');

const router = express.Router();

const freelancerSchema = z.object({
  name: z.string().min(1, '이름을 입력해 주세요.'),
  rrn: z.string().min(13, '주민등록번호를 입력해 주세요.'),
  type: z.enum(['sales', 'production'], { message: '형태를 선택해 주세요.' }),
  login_id: z.string().min(4, '로그인 아이디는 4자 이상이어야 합니다.'),
  password: z.string().min(4, '비밀번호는 4자 이상이어야 합니다.').optional(),
  address: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  bank_name: z.string().optional().default(''),
  account_number: z.string().optional().default(''),
});

router.get('/freelancers', async (req, res, next) => {
  try {
    const list = await Freelancer.findAll({ order: [['id', 'DESC']] });
    res.json(
      list.map((item) => ({
        ...item.toJSON(),
        rrn: maskRrn(decryptText(item.rrn_encrypted)),
        password_hash: undefined,
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.post('/freelancers', async (req, res, next) => {
  try {
    const data = freelancerSchema.parse(req.body);
    if (!data.password) {
      return res.status(400).json({ message: '비밀번호를 입력해 주세요.' });
    }
    const exists = await Freelancer.findOne({ where: { login_id: data.login_id } });
    if (exists) {
      return res.status(409).json({ message: '이미 사용 중인 로그인 아이디입니다.' });
    }
    const created = await Freelancer.create({
      ...data,
      rrn_encrypted: encryptText(data.rrn),
      password_hash: await bcrypt.hash(data.password, 10),
    });
    return res.status(201).json({ id: created.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    return next(error);
  }
});

router.put('/freelancers/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = await Freelancer.findByPk(id);
    if (!target) return res.status(404).json({ message: '프리랜서를 찾을 수 없습니다.' });

    const data = freelancerSchema.partial().parse(req.body);
    if (data.login_id && data.login_id !== target.login_id) {
      const exists = await Freelancer.findOne({ where: { login_id: data.login_id, id: { [Op.ne]: id } } });
      if (exists) return res.status(409).json({ message: '이미 사용 중인 로그인 아이디입니다.' });
    }

    const payload = { ...data };
    if (data.rrn) payload.rrn_encrypted = encryptText(data.rrn);
    if (data.password) payload.password_hash = await bcrypt.hash(data.password, 10);
    delete payload.rrn;
    delete payload.password;

    await target.update(payload);
    return res.json({ message: '수정되었습니다.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    return next(error);
  }
});

router.delete('/freelancers/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const payCount = await PayRecord.count({ where: { freelancer_id: id } });
    const productCount = await Product.count({ where: { freelancer_id: id } });
    if (payCount > 0 || productCount > 0) {
      return res.status(409).json({ message: '연결된 데이터가 있어 삭제할 수 없습니다.' });
    }
    const deleted = await Freelancer.destroy({ where: { id } });
    if (!deleted) return res.status(404).json({ message: '프리랜서를 찾을 수 없습니다.' });
    return res.json({ message: '삭제되었습니다.' });
  } catch (error) {
    return next(error);
  }
});

router.put('/freelancers/:id/account', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = await Freelancer.findByPk(id);
    if (!target) return res.status(404).json({ message: '프리랜서를 찾을 수 없습니다.' });

    const { login_id, password } = req.body;
    if (!login_id || !password) {
      return res.status(400).json({ message: '아이디와 비밀번호를 모두 입력해 주세요.' });
    }

    const exists = await Freelancer.findOne({ where: { login_id, id: { [Op.ne]: id } } });
    if (exists) return res.status(409).json({ message: '이미 사용 중인 로그인 아이디입니다.' });

    await target.update({ login_id, password_hash: await bcrypt.hash(password, 10) });
    return res.json({ message: '계정 정보가 변경되었습니다.' });
  } catch (error) {
    return next(error);
  }
});

router.get('/clients', async (req, res, next) => {
  try {
    const list = await Client.findAll({
      include: [{ model: Product, include: [{ model: Freelancer, attributes: ['id', 'name', 'type'] }] }],
      order: [['id', 'DESC'], [Product, 'id', 'ASC']],
    });
    res.json(list);
  } catch (error) {
    next(error);
  }
});

router.post('/clients', async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1, '거래처명을 입력해 주세요.'),
      address: z.string().optional().default(''),
      phone: z.string().optional().default(''),
      memo: z.string().optional().default(''),
    });
    const data = schema.parse(req.body);
    const created = await Client.create(data);
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    next(error);
  }
});

router.put('/clients/:id', async (req, res, next) => {
  try {
    const target = await Client.findByPk(Number(req.params.id));
    if (!target) return res.status(404).json({ message: '거래처를 찾을 수 없습니다.' });
    const payload = { ...req.body };
    if (payload.freelancer_id) {
      const sales = await Freelancer.findOne({ where: { id: payload.freelancer_id, type: 'sales' } });
      if (!sales) {
        return res.status(400).json({ message: '담당 프리랜서는 영업직만 선택할 수 있습니다.' });
      }
    }
    await target.update(payload);
    res.json({ message: '수정되었습니다.' });
  } catch (error) {
    next(error);
  }
});

router.delete('/clients/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const count = await Product.count({ where: { client_id: id } });
    if (count > 0) return res.status(409).json({ message: '연결된 제품이 있어 삭제할 수 없습니다.' });
    const deleted = await Client.destroy({ where: { id } });
    if (!deleted) return res.status(404).json({ message: '거래처를 찾을 수 없습니다.' });
    res.json({ message: '삭제되었습니다.' });
  } catch (error) {
    next(error);
  }
});

router.post('/products', async (req, res, next) => {
  try {
    const schema = z.object({
      client_id: z.number(),
      name: z.string().min(1, '제품명을 입력해 주세요.'),
      price_per_kg: z.number().positive('단가는 0보다 커야 합니다.'),
      freelancer_id: z.number(),
    });
    const data = schema.parse(req.body);
    const sales = await Freelancer.findOne({ where: { id: data.freelancer_id, type: 'sales' } });
    if (!sales) return res.status(400).json({ message: '담당 프리랜서는 영업직만 선택할 수 있습니다.' });
    const created = await Product.create(data);
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    next(error);
  }
});

router.put('/products/:id', async (req, res, next) => {
  try {
    const target = await Product.findByPk(Number(req.params.id));
    if (!target) return res.status(404).json({ message: '제품을 찾을 수 없습니다.' });
    await target.update(req.body);
    res.json({ message: '수정되었습니다.' });
  } catch (error) {
    next(error);
  }
});

router.delete('/products/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const used = await PayDetail.count({ where: { product_id: id } });
    if (used > 0) return res.status(409).json({ message: '지급 내역에 사용된 제품은 삭제할 수 없습니다.' });
    const deleted = await Product.destroy({ where: { id } });
    if (!deleted) return res.status(404).json({ message: '제품을 찾을 수 없습니다.' });
    res.json({ message: '삭제되었습니다.' });
  } catch (error) {
    next(error);
  }
});

router.get('/sales-freelancers', async (req, res, next) => {
  try {
    const list = await Freelancer.findAll({ where: { type: 'sales' }, attributes: ['id', 'name'] });
    res.json(list);
  } catch (error) {
    next(error);
  }
});

router.get('/freelancer-products/:freelancerId', async (req, res, next) => {
  try {
    const freelancerId = Number(req.params.freelancerId);
    const list = await Product.findAll({
      where: { freelancer_id: freelancerId },
      include: [{ model: Client, attributes: ['id', 'name'] }],
      order: [['id', 'ASC']],
    });
    res.json(list);
  } catch (error) {
    next(error);
  }
});

async function upsertPayRecord({ freelancer_id, year, month, details, id }) {
  return sequelize.transaction(async (tx) => {
    const products = await Product.findAll({ where: { id: details.map((d) => d.product_id) }, transaction: tx });
    const productsById = new Map(products.map((p) => [p.id, p]));

    for (const row of details) {
      if (!productsById.has(row.product_id)) {
        throw new Error('존재하지 않는 제품이 포함되어 있습니다.');
      }
    }

    const calculated = calculatePay(details, productsById);

    let payRecord;
    if (id) {
      payRecord = await PayRecord.findByPk(id, { transaction: tx });
      if (!payRecord) throw new Error('정산 내역을 찾을 수 없습니다.');
      await payRecord.update(
        {
          freelancer_id,
          year,
          month,
          total_amount: calculated.total_amount,
          withholding_tax: calculated.withholding_tax,
          net_amount: calculated.net_amount,
        },
        { transaction: tx }
      );
      await PayDetail.destroy({ where: { pay_record_id: id }, transaction: tx });
    } else {
      payRecord = await PayRecord.create(
        {
          freelancer_id,
          year,
          month,
          total_amount: calculated.total_amount,
          withholding_tax: calculated.withholding_tax,
          net_amount: calculated.net_amount,
        },
        { transaction: tx }
      );
    }

    await PayDetail.bulkCreate(
      calculated.rows.map((row) => ({
        pay_record_id: payRecord.id,
        product_id: row.product_id,
        quantity_kg: row.quantity_kg,
        amount: row.amount,
      })),
      { transaction: tx }
    );

    return payRecord;
  });
}

router.get('/pays', async (req, res, next) => {
  try {
    const { year, month } = req.query;
    const where = {};
    if (year) where.year = Number(year);
    if (month) where.month = Number(month);
    const list = await PayRecord.findAll({
      where,
      include: [{ model: Freelancer, attributes: ['id', 'name'] }],
      order: [['year', 'DESC'], ['month', 'DESC'], ['id', 'DESC']],
    });
    res.json(list);
  } catch (error) {
    next(error);
  }
});

router.get('/pays/:id', async (req, res, next) => {
  try {
    const pay = await PayRecord.findByPk(Number(req.params.id), {
      include: [
        { model: Freelancer, attributes: ['id', 'name', 'type'] },
        {
          model: PayDetail,
          include: [{ model: Product, include: [{ model: Client, attributes: ['name'] }] }],
        },
      ],
    });
    if (!pay) return res.status(404).json({ message: '정산 내역을 찾을 수 없습니다.' });
    res.json(pay);
  } catch (error) {
    next(error);
  }
});

async function getPayRecordForStatement(recordId) {
  return PayRecord.findByPk(recordId, {
    include: [
      { model: Freelancer },
      { model: PayDetail, include: [{ model: Product, include: [Client] }] },
    ],
  });
}

router.get('/pays/:id/statement', async (req, res, next) => {
  try {
    const record = await getPayRecordForStatement(Number(req.params.id));
    if (!record) return res.status(404).json({ message: '정산 내역을 찾을 수 없습니다.' });

    const freelancer = record.Freelancer.toJSON();
    freelancer.rrn = decryptText(freelancer.rrn_encrypted);

    const company = await CompanyInfo.findByPk(1);
    const config = await SystemConfig.findByPk(1);

    res.json({
      company,
      freelancer,
      payRecord: record,
      details: record.PayDetails,
      paymentDate: calcPaymentDate(record.year, record.month, config.payment_day),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/pays/:id/pdf', async (req, res, next) => {
  try {
    const record = await getPayRecordForStatement(Number(req.params.id));
    if (!record) return res.status(404).json({ message: '정산 내역을 찾을 수 없습니다.' });

    const company = await CompanyInfo.findByPk(1);
    const config = await SystemConfig.findByPk(1);

    const freelancer = record.Freelancer.toJSON();
    freelancer.rrn = decryptText(freelancer.rrn_encrypted);

    const html = renderStatementHtml({
      company: company.toJSON(),
      freelancer,
      payRecord: record.toJSON(),
      details: record.PayDetails,
      paymentDate: calcPaymentDate(record.year, record.month, config.payment_day),
    });

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
    });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="statement-${record.year}-${record.month}.pdf"`);
    res.send(pdf);
  } catch (error) {
    next(error);
  }
});

router.post('/pays', async (req, res, next) => {
  try {
    const schema = z.object({
      freelancer_id: z.number(),
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
      details: z.array(z.object({ product_id: z.number(), quantity_kg: z.number().min(0) })).min(1, '상세 내역을 입력해 주세요.'),
    });
    const data = schema.parse(req.body);
    const saved = await upsertPayRecord(data);
    res.status(201).json({ id: saved.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    next(error);
  }
});

router.put('/pays/:id', async (req, res, next) => {
  try {
    const schema = z.object({
      freelancer_id: z.number(),
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
      details: z.array(z.object({ product_id: z.number(), quantity_kg: z.number().min(0) })).min(1, '상세 내역을 입력해 주세요.'),
    });
    const data = schema.parse(req.body);
    const saved = await upsertPayRecord({ ...data, id: Number(req.params.id) });
    res.json({ id: saved.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    next(error);
  }
});

router.delete('/pays/:id', async (req, res, next) => {
  try {
    const deleted = await PayRecord.destroy({ where: { id: Number(req.params.id) } });
    if (!deleted) return res.status(404).json({ message: '정산 내역을 찾을 수 없습니다.' });
    res.json({ message: '삭제되었습니다.' });
  } catch (error) {
    next(error);
  }
});

router.get('/settings/company-info', async (req, res, next) => {
  try {
    const company = await CompanyInfo.findByPk(1);
    res.json(company);
  } catch (error) {
    next(error);
  }
});

router.put('/settings/company-info', async (req, res, next) => {
  try {
    const company = await CompanyInfo.findByPk(1);
    await company.update({ ...req.body, updated_at: new Date() });
    res.json({ message: '회사 정보가 저장되었습니다.' });
  } catch (error) {
    next(error);
  }
});

router.get('/settings/system-config', async (req, res, next) => {
  try {
    const config = await SystemConfig.findByPk(1);
    res.json(config);
  } catch (error) {
    next(error);
  }
});

router.put('/settings/system-config', async (req, res, next) => {
  try {
    const payment_day = Number(req.body.payment_day);
    if (payment_day < 1 || payment_day > 31) {
      return res.status(400).json({ message: '지급일은 1~31 사이여야 합니다.' });
    }
    const config = await SystemConfig.findByPk(1);
    await config.update({ payment_day });
    res.json({ message: '지급일이 저장되었습니다.' });
  } catch (error) {
    next(error);
  }
});

router.put('/settings/admin-account', async (req, res, next) => {
  try {
    const { login_id, password } = req.body;
    if (!login_id || !password) {
      return res.status(400).json({ message: '아이디와 비밀번호를 모두 입력해 주세요.' });
    }
    const admin = await AdminAccount.findByPk(req.session.user.id);
    await admin.update({ login_id, password_hash: await bcrypt.hash(password, 10) });
    req.session.user.login_id = login_id;
    res.json({ message: '관리자 계정이 변경되었습니다.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

