const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');

const CompanyInfo = sequelize.define(
  'CompanyInfo',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    company_name: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
    representative: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
    business_reg_number: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '' },
    business_type: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
    business_sector: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
    address: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '' },
    phone: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '' },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { tableName: 'CompanyInfo', timestamps: false }
);

const AdminAccount = sequelize.define(
  'AdminAccount',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    login_id: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
  },
  { tableName: 'AdminAccount', timestamps: false }
);

const Freelancer = sequelize.define(
  'Freelancer',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(80), allowNull: false },
    rrn_encrypted: { type: DataTypes.TEXT, allowNull: false },
    type: { type: DataTypes.ENUM('sales', 'production'), allowNull: false },
    login_id: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    address: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '' },
    phone: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '' },
    bank_name: { type: DataTypes.STRING(60), allowNull: false, defaultValue: '' },
    account_number: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
  },
  { tableName: 'Freelancer', timestamps: false }
);

const Client = sequelize.define(
  'Client',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    address: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '' },
    phone: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '' },
    memo: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  },
  { tableName: 'Client', timestamps: false }
);

const Product = sequelize.define(
  'Product',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    price_per_kg: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    freelancer_id: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: 'Product', timestamps: false }
);

const PayRecord = sequelize.define(
  'PayRecord',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    freelancer_id: { type: DataTypes.INTEGER, allowNull: false },
    year: { type: DataTypes.INTEGER, allowNull: false },
    month: { type: DataTypes.INTEGER, allowNull: false },
    total_amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    withholding_tax: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    net_amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  },
  { tableName: 'PayRecord', timestamps: false }
);

const PayDetail = sequelize.define(
  'PayDetail',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    pay_record_id: { type: DataTypes.INTEGER, allowNull: false },
    product_id: { type: DataTypes.INTEGER, allowNull: false },
    quantity_kg: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  },
  { tableName: 'PayDetail', timestamps: false }
);

const SystemConfig = sequelize.define(
  'SystemConfig',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    payment_day: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 25 },
  },
  { tableName: 'SystemConfig', timestamps: false }
);

Client.hasMany(Product, { foreignKey: 'client_id', onDelete: 'CASCADE' });
Product.belongsTo(Client, { foreignKey: 'client_id' });

Freelancer.hasMany(Product, { foreignKey: 'freelancer_id', onDelete: 'RESTRICT' });
Product.belongsTo(Freelancer, { foreignKey: 'freelancer_id' });

Freelancer.hasMany(PayRecord, { foreignKey: 'freelancer_id', onDelete: 'CASCADE' });
PayRecord.belongsTo(Freelancer, { foreignKey: 'freelancer_id' });

PayRecord.hasMany(PayDetail, { foreignKey: 'pay_record_id', onDelete: 'CASCADE' });
PayDetail.belongsTo(PayRecord, { foreignKey: 'pay_record_id' });

Product.hasMany(PayDetail, { foreignKey: 'product_id', onDelete: 'RESTRICT' });
PayDetail.belongsTo(Product, { foreignKey: 'product_id' });

async function seedDefaults() {
  const admin = await AdminAccount.findOne({ where: { login_id: 'admin' } });
  if (!admin) {
    const password_hash = await bcrypt.hash('1111', 10);
    await AdminAccount.create({ login_id: 'admin', password_hash });
  }

  const config = await SystemConfig.findByPk(1);
  if (!config) {
    await SystemConfig.create({ id: 1, payment_day: 25 });
  }

  const company = await CompanyInfo.findByPk(1);
  if (!company) {
    await CompanyInfo.create({ id: 1 });
  }
}

module.exports = {
  sequelize,
  CompanyInfo,
  AdminAccount,
  Freelancer,
  Client,
  Product,
  PayRecord,
  PayDetail,
  SystemConfig,
  seedDefaults,
};

