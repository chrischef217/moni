const express = require('express');
const puppeteer = require('puppeteer');
const { CompanyInfo, Freelancer, PayRecord, PayDetail, Product, Client, SystemConfig } = require('../models');
const { decryptText } = require('../utils/crypto');
const { calcPaymentDate, renderStatementHtml } = require('../services/statementTemplate');

const router = express.Router();

async function getPayRecordForFreelancer(recordId, freelancerId) {
  return PayRecord.findOne({
    where: { id: recordId, freelancer_id: freelancerId },
    include: [
      { model: Freelancer },
      { model: PayDetail, include: [{ model: Product, include: [Client] }] },
    ],
  });
}

router.get('/pays', async (req, res, next) => {
  try {
    const { year, month } = req.query;
    const where = { freelancer_id: req.session.user.id };
    if (year) where.year = Number(year);
    if (month) where.month = Number(month);

    const list = await PayRecord.findAll({
      where,
      order: [['year', 'DESC'], ['month', 'DESC'], ['id', 'DESC']],
    });
    res.json(list);
  } catch (error) {
    next(error);
  }
});

router.get('/pays/:id', async (req, res, next) => {
  try {
    const record = await getPayRecordForFreelancer(Number(req.params.id), req.session.user.id);
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
    const record = await getPayRecordForFreelancer(Number(req.params.id), req.session.user.id);
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
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="statement-${record.year}-${record.month}.pdf"`);
    res.send(pdf);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

