export type FreelancerType = 'sales' | 'production'

export type CompanyInfo = {
  company_name: string
  representative: string
  business_reg_number: string
  business_type: string
  business_sector: string
  address: string
  phone: string
}

export type AdminAccount = {
  login_id: string
  password: string
}

export type Freelancer = {
  id: number
  name: string
  rrn: string
  type: FreelancerType
  login_id: string
  password: string
  address: string
  phone: string
  bank_name: string
  account_number: string
}

export type Client = {
  id: number
  name: string
  address: string
  phone: string
  memo: string
}

export type Product = {
  id: number
  client_id: number
  name: string
  price_per_kg: number
  freelancer_id: number
  sort_order: number
}

export type PayDetail = {
  id: number
  product_id: number
  quantity_kg: number
  amount: number
}

export type PayRecord = {
  id: number
  freelancer_id: number
  year: number
  month: number
  total_amount: number
  withholding_tax: number
  net_amount: number
  details: PayDetail[]
}

export type AllowanceState = {
  company: CompanyInfo
  payment_day: number
  admin_account: AdminAccount
  freelancers: Freelancer[]
  clients: Client[]
  products: Product[]
  payRecords: PayRecord[]
}

export type AllowanceRole = 'admin' | 'freelancer'

export type AllowanceSessionUser = {
  role: AllowanceRole
  loginId: string
  freelancerId: number | null
  displayName: string
}

export const EMPTY_COMPANY_INFO: CompanyInfo = {
  company_name: '',
  representative: '',
  business_reg_number: '',
  business_type: '',
  business_sector: '',
  address: '',
  phone: '',
}

export const DEFAULT_ALLOWANCE_STATE: AllowanceState = {
  company: { ...EMPTY_COMPANY_INFO },
  payment_day: 25,
  admin_account: {
    login_id: 'admin',
    password: '1111',
  },
  freelancers: [],
  clients: [],
  products: [],
  payRecords: [],
}
