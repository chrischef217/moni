'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

export type AllowanceTabKey = 'freelancer' | 'client-product' | 'pay' | 'settings';
type FreelancerType = 'sales' | 'production';

export type CompanyInfo = {
  company_name: string;
  representative: string;
  business_reg_number: string;
  business_type: string;
  business_sector: string;
  address: string;
  phone: string;
};

type AdminAccount = {
  login_id: string;
  password: string;
};

type Freelancer = {
  id: number;
  name: string;
  rrn: string;
  type: FreelancerType;
  login_id: string;
  password: string;
  address: string;
  phone: string;
  bank_name: string;
  account_number: string;
};

type Client = {
  id: number;
  name: string;
  address: string;
  phone: string;
  memo: string;
};

type Product = {
  id: number;
  client_id: number;
  name: string;
  price_per_kg: number;
  freelancer_id: number;
  sort_order: number;
};

type PayDetail = {
  id: number;
  product_id: number;
  quantity_kg: number;
  amount: number;
};

type PayRecord = {
  id: number;
  freelancer_id: number;
  year: number;
  month: number;
  total_amount: number;
  withholding_tax: number;
  net_amount: number;
  details: PayDetail[];
};

type AllowanceStore = {
  company: CompanyInfo;
  payment_day: number;
  admin_account: AdminAccount;
  freelancers: Freelancer[];
  clients: Client[];
  products: Product[];
  payRecords: PayRecord[];
};

type AllowanceModuleProps = {
  activeTab: AllowanceTabKey;
  onChangeTab: (tab: AllowanceTabKey) => void;
  onMoveToChat: () => void;
  companyInfo: CompanyInfo;
};

const STORAGE_KEY = 'moni.allowance.module.v2';
export const EMPTY_COMPANY_INFO: CompanyInfo = {
  company_name: '',
  representative: '',
  business_reg_number: '',
  business_type: '',
  business_sector: '',
  address: '',
  phone: '',
};

const DEFAULT_STORE: AllowanceStore = {
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
};

const EMPTY_FREELANCER_FORM: Omit<Freelancer, 'id'> = {
  name: '',
  rrn: '',
  type: 'sales',
  login_id: '',
  password: '',
  address: '',
  phone: '',
  bank_name: '',
  account_number: '',
};

const EMPTY_CLIENT_FORM: Omit<Client, 'id'> = {
  name: '',
  address: '',
  phone: '',
  memo: '',
};

const EMPTY_PRODUCT_FORM = {
  client_id: '',
  name: '',
  price_per_kg: '',
  freelancer_id: '',
};

function nextId<T extends { id: number }>(list: T[]) {
  return list.length ? Math.max(...list.map((item) => item.id)) + 1 : 1;
}

function maskRrn(rrn: string) {
  const safe = rrn.replace(/[^0-9]/g, '');
  if (safe.length < 7) return rrn;
  return `${safe.slice(0, 6)}-${'*'.repeat(Math.max(0, safe.length - 6))}`;
}

function toCurrency(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function paymentDateText(year: number, month: number, paymentDay: number) {
  const d = new Date(year, month, paymentDay);
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, '0')}월 ${String(d.getDate()).padStart(2, '0')}일`;
}

function safeNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sortProductsByOrder(products: Product[]) {
  return [...products].sort((a, b) => {
    const orderDiff = a.sort_order - b.sort_order;
    if (orderDiff !== 0) return orderDiff;
    return a.id - b.id;
  });
}

function normalizeProductOrders(products: Product[]) {
  const grouped = new Map<number, Product[]>();

  products.forEach((product) => {
    const current = grouped.get(product.client_id) ?? [];
    current.push(product);
    grouped.set(product.client_id, current);
  });

  const normalized: Product[] = [];
  grouped.forEach((group) => {
    sortProductsByOrder(group).forEach((product, index) => {
      normalized.push({ ...product, sort_order: index + 1 });
    });
  });

  return normalized;
}

function parseStore(raw: string): AllowanceStore {
  const parsed = JSON.parse(raw) as Partial<AllowanceStore>;
  const rawProducts = Array.isArray(parsed.products) ? parsed.products : [];
  const products: Product[] = rawProducts.map((item, index) => {
    const fallbackOrder = index + 1;
    const order = typeof item.sort_order === 'number' && Number.isFinite(item.sort_order) && item.sort_order > 0
      ? item.sort_order
      : fallbackOrder;

    return {
      ...(item as Product),
      sort_order: order,
    };
  });

  return {
    ...DEFAULT_STORE,
    ...parsed,
    company: { ...DEFAULT_STORE.company, ...(parsed.company ?? {}) },
    admin_account: { ...DEFAULT_STORE.admin_account, ...(parsed.admin_account ?? {}) },
    freelancers: Array.isArray(parsed.freelancers) ? parsed.freelancers : [],
    clients: Array.isArray(parsed.clients) ? parsed.clients : [],
    products: normalizeProductOrders(products),
    payRecords: Array.isArray(parsed.payRecords) ? parsed.payRecords : [],
  };
}

function StatementPaper({
  company,
  freelancer,
  payRecord,
  details,
  paymentDate,
}: {
  company: CompanyInfo;
  freelancer: Freelancer;
  payRecord: PayRecord;
  details: Array<{
    id: number;
    client_name: string;
    product_name: string;
    quantity_kg: number;
    price_per_kg: number;
    amount: number;
  }>;
  paymentDate: string;
}) {
  return (
    <div className="statement-print mx-auto w-full max-w-[920px] bg-white p-8 text-black shadow-lg print:shadow-none">
      <h1 className="mb-2 text-center text-3xl font-bold">수수료·수당 지급명세서</h1>
      <div className="mb-3 flex justify-end gap-8 text-sm">
        <span>[✓] 지급자 보관용</span>
        <span>[✓] 소득자 보관용</span>
      </div>

      <h2 className="mb-2 text-lg font-bold">1. 지급자</h2>
      <table className="mb-4 w-full border-collapse text-sm">
        <tbody>
          <tr>
            <th className="w-40 border border-black bg-slate-100 p-2 text-left">회사명</th>
            <td className="border border-black p-2" colSpan={3}>{company.company_name}</td>
          </tr>
          <tr>
            <th className="border border-black bg-slate-100 p-2 text-left">대표자</th>
            <td className="border border-black p-2">{company.representative}</td>
            <th className="border border-black bg-slate-100 p-2 text-left">사업자등록번호</th>
            <td className="border border-black p-2">{company.business_reg_number}</td>
          </tr>
          <tr>
            <th className="border border-black bg-slate-100 p-2 text-left">업종/업태</th>
            <td className="border border-black p-2" colSpan={3}>{company.business_type} / {company.business_sector}</td>
          </tr>
          <tr>
            <th className="border border-black bg-slate-100 p-2 text-left">주소</th>
            <td className="border border-black p-2" colSpan={3}>{company.address}</td>
          </tr>
          <tr>
            <th className="border border-black bg-slate-100 p-2 text-left">연락처</th>
            <td className="border border-black p-2" colSpan={3}>{company.phone}</td>
          </tr>
        </tbody>
      </table>

      <h2 className="mb-2 text-lg font-bold">2. 지급 대상자</h2>
      <table className="mb-4 w-full border-collapse text-sm">
        <tbody>
          <tr>
            <th className="w-40 border border-black bg-slate-100 p-2 text-left">성명</th>
            <td className="border border-black p-2">{freelancer.name}</td>
            <th className="border border-black bg-slate-100 p-2 text-left">은행명</th>
            <td className="border border-black p-2">{freelancer.bank_name}</td>
          </tr>
          <tr>
            <th className="border border-black bg-slate-100 p-2 text-left">주민등록번호</th>
            <td className="border border-black p-2">{freelancer.rrn}</td>
            <th className="border border-black bg-slate-100 p-2 text-left">계좌번호</th>
            <td className="border border-black p-2">{freelancer.account_number}</td>
          </tr>
          <tr>
            <th className="border border-black bg-slate-100 p-2 text-left">주소</th>
            <td className="border border-black p-2" colSpan={3}>{freelancer.address}</td>
          </tr>
          <tr>
            <th className="border border-black bg-slate-100 p-2 text-left">연락처</th>
            <td className="border border-black p-2">{freelancer.phone}</td>
            <th className="border border-black bg-slate-100 p-2 text-left">지급일</th>
            <td className="border border-black p-2">{paymentDate}</td>
          </tr>
        </tbody>
      </table>

      <h2 className="mb-2 text-lg font-bold">■ 상세 내역</h2>
      <table className="mb-4 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-black bg-slate-100 p-2">거래처</th>
            <th className="border border-black bg-slate-100 p-2">제품명</th>
            <th className="border border-black bg-slate-100 p-2">수량(kg)</th>
            <th className="border border-black bg-slate-100 p-2">단가(원/kg)</th>
            <th className="border border-black bg-slate-100 p-2">수당액(원)</th>
          </tr>
        </thead>
        <tbody>
          {details.map((row) => (
            <tr key={row.id}>
              <td className="border border-black p-2">{row.client_name}</td>
              <td className="border border-black p-2">{row.product_name}</td>
              <td className="border border-black p-2 text-right">{row.quantity_kg.toLocaleString('ko-KR')}</td>
              <td className="border border-black p-2 text-right">{Math.round(row.price_per_kg).toLocaleString('ko-KR')}</td>
              <td className="border border-black p-2 text-right">{Math.round(row.amount).toLocaleString('ko-KR')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mb-2 text-lg font-bold">■ 지급 내역</h2>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-black bg-slate-100 p-2">Year</th>
            <th className="border border-black bg-slate-100 p-2">Month</th>
            <th className="border border-black bg-slate-100 p-2">금액</th>
            <th className="border border-black bg-slate-100 p-2">원천징수 세액</th>
            <th className="border border-black bg-slate-100 p-2">차인지급액</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-black p-2 text-center">{payRecord.year}</td>
            <td className="border border-black p-2 text-center">{payRecord.month}</td>
            <td className="border border-black p-2 text-right">{Math.round(payRecord.total_amount).toLocaleString('ko-KR')}</td>
            <td className="border border-black p-2 text-right">{Math.round(payRecord.withholding_tax).toLocaleString('ko-KR')}</td>
            <td className="border border-black p-2 text-right">{Math.round(payRecord.net_amount).toLocaleString('ko-KR')}</td>
          </tr>
        </tbody>
      </table>

      <p className="mt-6 text-center text-base">위의 수익 금액을 영수합니다</p>
    </div>
  );
}

export default function AllowanceModule({ activeTab, onChangeTab, onMoveToChat, companyInfo }: AllowanceModuleProps) {
  const [store, setStore] = useState<AllowanceStore>(DEFAULT_STORE);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState('');

  const [freelancerForm, setFreelancerForm] = useState<Omit<Freelancer, 'id'>>(EMPTY_FREELANCER_FORM);
  const [editingFreelancerId, setEditingFreelancerId] = useState<number | null>(null);

  const [clientForm, setClientForm] = useState<Omit<Client, 'id'>>(EMPTY_CLIENT_FORM);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT_FORM);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [productEditForm, setProductEditForm] = useState(EMPTY_PRODUCT_FORM);

  const [payYear, setPayYear] = useState(new Date().getFullYear());
  const [payMonth, setPayMonth] = useState(new Date().getMonth() + 1);
  const [selectedFreelancerId, setSelectedFreelancerId] = useState('');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [editingPayId, setEditingPayId] = useState<number | null>(null);
  const [loadedDetailMap, setLoadedDetailMap] = useState<Record<number, number> | null>(null);
  const [previewPayId, setPreviewPayId] = useState<number | null>(null);

  const [settingsTab, setSettingsTab] = useState<'payment' | 'admin' | 'freelancers'>('payment');
  const [paymentDayInput, setPaymentDayInput] = useState(DEFAULT_STORE.payment_day);
  const [adminForm, setAdminForm] = useState<AdminAccount>(DEFAULT_STORE.admin_account);
  const [accountRows, setAccountRows] = useState<Array<{ id: number; name: string; login_id: string; password: string }>>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const loaded = parseStore(raw);
        setStore(loaded);
      } catch {
        setStore(DEFAULT_STORE);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store, hydrated]);

  useEffect(() => {
    setPaymentDayInput(store.payment_day);
    setAdminForm(store.admin_account);
    setAccountRows(store.freelancers.map((item) => ({ id: item.id, name: item.name, login_id: item.login_id, password: item.password })));
  }, [store]);

  const salesFreelancers = useMemo(
    () => store.freelancers.filter((item) => item.type === 'sales'),
    [store.freelancers],
  );

  const selectedFreelancerProducts = useMemo(() => {
    const id = Number(selectedFreelancerId || 0);
    if (!id) return [];
    return [...store.products]
      .filter((item) => item.freelancer_id === id)
      .sort((a, b) => {
        const clientDiff = a.client_id - b.client_id;
        if (clientDiff !== 0) return clientDiff;
        const orderDiff = a.sort_order - b.sort_order;
        if (orderDiff !== 0) return orderDiff;
        return a.id - b.id;
      });
  }, [selectedFreelancerId, store.products]);

  useEffect(() => {
    if (!selectedFreelancerId) {
      setQuantities({});
      return;
    }
    const base: Record<number, number> = {};
    selectedFreelancerProducts.forEach((item) => {
      base[item.id] = loadedDetailMap?.[item.id] ?? 0;
    });
    setQuantities(base);
  }, [selectedFreelancerId, selectedFreelancerProducts, loadedDetailMap]);

  const payCalc = useMemo(() => {
    const detailRows = selectedFreelancerProducts.map((product) => {
      const qty = Number(quantities[product.id] || 0);
      const amount = qty * product.price_per_kg;
      return { product_id: product.id, quantity_kg: qty, amount };
    });
    const total = detailRows.reduce((sum, row) => sum + row.amount, 0);
    const withholding = Math.round(total * 0.033);
    const net = total - withholding;
    return { detailRows, total, withholding, net };
  }, [selectedFreelancerProducts, quantities]);

  const recordsForMonth = useMemo(
    () => store.payRecords.filter((row) => row.year === payYear && row.month === payMonth),
    [store.payRecords, payYear, payMonth],
  );

  const previewPayload = useMemo(() => {
    if (!previewPayId) return null;
    const record = store.payRecords.find((item) => item.id === previewPayId);
    if (!record) return null;
    const freelancer = store.freelancers.find((item) => item.id === record.freelancer_id);
    if (!freelancer) return null;

    const details = record.details.map((d) => {
      const product = store.products.find((p) => p.id === d.product_id);
      const client = product ? store.clients.find((c) => c.id === product.client_id) : undefined;
      return {
        id: d.id,
        client_name: client?.name ?? '',
        product_name: product?.name ?? '',
        quantity_kg: d.quantity_kg,
        price_per_kg: product?.price_per_kg ?? 0,
        amount: d.amount,
      };
    });

    return {
      company: companyInfo,
      freelancer,
      payRecord: record,
      details,
      paymentDate: paymentDateText(record.year, record.month, store.payment_day),
    };
  }, [previewPayId, store, companyInfo]);

  const setInfo = (message: string) => {
    setNotice(message);
  };

  const validateFreelancer = (form: Omit<Freelancer, 'id'>) => {
    if (!form.name.trim()) return '이름을 입력해 주세요.';
    if (!form.rrn.trim() || form.rrn.replace(/[^0-9]/g, '').length < 13) return '주민등록번호를 입력해 주세요.';
    if (!form.login_id.trim()) return '로그인 아이디를 입력해 주세요.';
    if (!editingFreelancerId && !form.password.trim()) return '비밀번호를 입력해 주세요.';

    const duplicated = store.freelancers.some(
      (item) => item.login_id === form.login_id && item.id !== editingFreelancerId,
    );
    if (duplicated) return '이미 사용 중인 로그인 아이디입니다.';
    return '';
  };

  const submitFreelancer = (event: FormEvent) => {
    event.preventDefault();
    const error = validateFreelancer(freelancerForm);
    if (error) {
      setInfo(error);
      return;
    }

    if (editingFreelancerId) {
      setStore((prev) => ({
        ...prev,
        freelancers: prev.freelancers.map((item) =>
          item.id === editingFreelancerId
            ? {
                ...item,
                ...freelancerForm,
                password: freelancerForm.password.trim() ? freelancerForm.password : item.password,
              }
            : item,
        ),
      }));
      setInfo('프리랜서 정보가 수정되었습니다.');
    } else {
      setStore((prev) => ({
        ...prev,
        freelancers: [...prev.freelancers, { ...freelancerForm, id: nextId(prev.freelancers) }],
      }));
      setInfo('프리랜서가 등록되었습니다.');
    }

    setFreelancerForm(EMPTY_FREELANCER_FORM);
    setEditingFreelancerId(null);
  };

  const editFreelancer = (id: number) => {
    const target = store.freelancers.find((item) => item.id === id);
    if (!target) return;
    setEditingFreelancerId(id);
    setFreelancerForm({ ...target, password: '' });
    setInfo('수정 모드로 전환했습니다.');
  };

  const removeFreelancer = (id: number) => {
    const hasProduct = store.products.some((item) => item.freelancer_id === id);
    const hasPayRecord = store.payRecords.some((item) => item.freelancer_id === id);
    if (hasProduct || hasPayRecord) {
      setInfo('연결된 제품 또는 수당 내역이 있어 삭제할 수 없습니다.');
      return;
    }

    setStore((prev) => ({ ...prev, freelancers: prev.freelancers.filter((item) => item.id !== id) }));
    if (editingFreelancerId === id) {
      setEditingFreelancerId(null);
      setFreelancerForm(EMPTY_FREELANCER_FORM);
    }
    setInfo('프리랜서가 삭제되었습니다.');
  };

  const submitClient = (event: FormEvent) => {
    event.preventDefault();
    if (!clientForm.name.trim()) {
      setInfo('거래처명을 입력해 주세요.');
      return;
    }

    if (editingClientId) {
      setStore((prev) => ({
        ...prev,
        clients: prev.clients.map((item) => (item.id === editingClientId ? { ...item, ...clientForm } : item)),
      }));
      setInfo('거래처 정보가 수정되었습니다.');
    } else {
      setStore((prev) => ({
        ...prev,
        clients: [...prev.clients, { ...clientForm, id: nextId(prev.clients) }],
      }));
      setInfo('거래처가 등록되었습니다.');
    }

    setEditingClientId(null);
    setClientForm(EMPTY_CLIENT_FORM);
  };

  const startEditClient = (id: number) => {
    const target = store.clients.find((item) => item.id === id);
    if (!target) return;
    setEditingClientId(id);
    setClientForm({
      name: target.name,
      address: target.address,
      phone: target.phone,
      memo: target.memo,
    });
    setInfo('거래처 수정 모드입니다.');
  };

  const submitProduct = (event: FormEvent) => {
    event.preventDefault();
    if (!productForm.client_id || !productForm.freelancer_id || !productForm.name.trim()) {
      setInfo('거래처/제품명/담당 프리랜서를 입력해 주세요.');
      return;
    }

    const payload: Product = {
      id: nextId(store.products),
      client_id: Number(productForm.client_id),
      name: productForm.name,
      price_per_kg: safeNumber(productForm.price_per_kg),
      freelancer_id: Number(productForm.freelancer_id),
      sort_order: store.products.filter((item) => item.client_id === Number(productForm.client_id)).length + 1,
    };

    setStore((prev) => ({ ...prev, products: normalizeProductOrders([...prev.products, payload]) }));
    setProductForm(EMPTY_PRODUCT_FORM);
    setInfo('제품이 등록되었습니다.');
  };

  const startEditProduct = (product: Product) => {
    setEditingProductId(product.id);
    setProductEditForm({
      client_id: String(product.client_id),
      name: product.name,
      price_per_kg: String(product.price_per_kg),
      freelancer_id: String(product.freelancer_id),
    });
    setInfo('제품 수정 모드입니다.');
  };

  const saveProductEdit = () => {
    if (!editingProductId) return;
    if (!productEditForm.client_id || !productEditForm.freelancer_id || !productEditForm.name.trim()) {
      setInfo('거래처/제품명/담당 프리랜서를 입력해 주세요.');
      return;
    }

    const nextClientId = Number(productEditForm.client_id);
    setStore((prev) => ({
      ...prev,
      products: normalizeProductOrders(
        prev.products.map((item) => {
          if (item.id !== editingProductId) return item;

          const movedToAnotherClient = item.client_id !== nextClientId;
          const nextSortOrder = movedToAnotherClient
            ? prev.products.filter((product) => product.client_id === nextClientId && product.id !== editingProductId).length + 1
            : item.sort_order;

          return {
            ...item,
            client_id: nextClientId,
            name: productEditForm.name,
            price_per_kg: safeNumber(productEditForm.price_per_kg),
            freelancer_id: Number(productEditForm.freelancer_id),
            sort_order: nextSortOrder,
          };
        }),
      ),
    }));
    setEditingProductId(null);
    setProductEditForm(EMPTY_PRODUCT_FORM);
    setInfo('제품 정보가 수정되었습니다.');
  };

  const removeProduct = (id: number) => {
    const used = store.payRecords.some((record) => record.details.some((d) => d.product_id === id));
    if (used) {
      setInfo('지급 내역에 사용된 제품은 삭제할 수 없습니다.');
      return;
    }

    setStore((prev) => ({ ...prev, products: normalizeProductOrders(prev.products.filter((item) => item.id !== id)) }));
    if (editingProductId === id) {
      setEditingProductId(null);
      setProductEditForm(EMPTY_PRODUCT_FORM);
    }
    setInfo('제품이 삭제되었습니다.');
  };

  const moveProductOrder = (clientId: number, productId: number, direction: 'up' | 'down') => {
    setStore((prev) => {
      const clientProducts = sortProductsByOrder(prev.products.filter((item) => item.client_id === clientId));
      const index = clientProducts.findIndex((item) => item.id === productId);
      if (index < 0) return prev;

      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= clientProducts.length) return prev;

      const reordered = [...clientProducts];
      [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

      const nextOrderMap = new Map<number, number>();
      reordered.forEach((item, orderIndex) => {
        nextOrderMap.set(item.id, orderIndex + 1);
      });

      const nextProducts = prev.products.map((item) =>
        item.client_id === clientId
          ? { ...item, sort_order: nextOrderMap.get(item.id) ?? item.sort_order }
          : item,
      );

      return { ...prev, products: normalizeProductOrders(nextProducts) };
    });
    setInfo(direction === 'up' ? '제품 순서를 위로 이동했습니다.' : '제품 순서를 아래로 이동했습니다.');
  };

  const removeClient = (id: number) => {
    const target = store.clients.find((item) => item.id === id);
    if (!target) return;

    const linkedProducts = store.products.filter((item) => item.client_id === id);
    const usedProductIds = new Set(
      store.payRecords.flatMap((record) => record.details.map((detail) => detail.product_id)),
    );

    const hasLockedProduct = linkedProducts.some((item) => usedProductIds.has(item.id));
    if (hasLockedProduct) {
      setInfo('수당 내역에 사용된 제품이 있어 거래처를 삭제할 수 없습니다.');
      return;
    }

    const warning = linkedProducts.length > 0
      ? `${target.name} 거래처를 삭제하면 연결된 제품 ${linkedProducts.length}개도 함께 삭제됩니다. 계속하시겠습니까?`
      : `${target.name} 거래처를 삭제하시겠습니까?`;

    if (typeof window !== 'undefined' && !window.confirm(warning)) return;

    const linkedProductIds = new Set(linkedProducts.map((item) => item.id));
    setStore((prev) => ({
      ...prev,
      clients: prev.clients.filter((item) => item.id !== id),
      products: normalizeProductOrders(prev.products.filter((item) => item.client_id !== id)),
    }));

    if (editingClientId === id) {
      setEditingClientId(null);
      setClientForm(EMPTY_CLIENT_FORM);
    }
    if (editingProductId && linkedProductIds.has(editingProductId)) {
      setEditingProductId(null);
      setProductEditForm(EMPTY_PRODUCT_FORM);
    }

    setInfo('거래처가 삭제되었습니다.');
  };

  const savePayRecord = () => {
    const freelancerId = Number(selectedFreelancerId);
    if (!freelancerId) {
      setInfo('프리랜서를 선택해 주세요.');
      return;
    }

    const details = payCalc.detailRows
      .filter((row) => row.quantity_kg > 0)
      .map((row, index) => ({
        id: index + 1,
        product_id: row.product_id,
        quantity_kg: row.quantity_kg,
        amount: row.amount,
      }));

    if (details.length === 0) {
      setInfo('제품별 수량을 1개 이상 입력해 주세요.');
      return;
    }

    const payload: PayRecord = {
      id: editingPayId ?? nextId(store.payRecords),
      freelancer_id: freelancerId,
      year: payYear,
      month: payMonth,
      total_amount: payCalc.total,
      withholding_tax: payCalc.withholding,
      net_amount: payCalc.net,
      details,
    };

    if (editingPayId) {
      setStore((prev) => ({
        ...prev,
        payRecords: prev.payRecords.map((item) => (item.id === editingPayId ? payload : item)),
      }));
      setInfo('수당 내역이 수정되었습니다.');
    } else {
      setStore((prev) => ({ ...prev, payRecords: [...prev.payRecords, payload] }));
      setInfo('수당 내역이 저장되었습니다.');
    }

    setEditingPayId(null);
    setLoadedDetailMap(null);
  };

  const startEditPay = (recordId: number) => {
    const record = store.payRecords.find((item) => item.id === recordId);
    if (!record) return;

    const detailMap: Record<number, number> = {};
    record.details.forEach((d) => {
      detailMap[d.product_id] = d.quantity_kg;
    });

    setEditingPayId(record.id);
    setPayYear(record.year);
    setPayMonth(record.month);
    setSelectedFreelancerId(String(record.freelancer_id));
    setLoadedDetailMap(detailMap);
    setInfo('수정 모드로 불러왔습니다.');
  };

  const cancelEditPay = () => {
    setEditingPayId(null);
    setLoadedDetailMap(null);
    setInfo('수정 모드를 취소했습니다.');
  };

  const removePay = (recordId: number) => {
    setStore((prev) => ({ ...prev, payRecords: prev.payRecords.filter((item) => item.id !== recordId) }));
    if (previewPayId === recordId) setPreviewPayId(null);
    if (editingPayId === recordId) cancelEditPay();
    setInfo('수당 내역이 삭제되었습니다.');
  };

  const openPreview = (recordId: number) => {
    setPreviewPayId(recordId);
    setInfo('정산서 미리보기를 표시했습니다.');
  };

  const printStatement = (recordId?: number) => {
    if (recordId) setPreviewPayId(recordId);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const savePaymentDay = () => {
    if (paymentDayInput < 1 || paymentDayInput > 31) {
      setInfo('지급일은 1~31 사이 숫자여야 합니다.');
      return;
    }
    setStore((prev) => ({ ...prev, payment_day: paymentDayInput }));
    setInfo('지급일이 저장되었습니다.');
  };

  const saveAdminAccount = () => {
    if (!adminForm.login_id.trim() || !adminForm.password.trim()) {
      setInfo('관리자 아이디/비밀번호를 입력해 주세요.');
      return;
    }
    setStore((prev) => ({ ...prev, admin_account: adminForm }));
    setInfo('관리자 계정이 변경되었습니다.');
  };

  const saveFreelancerAccount = (id: number, login_id: string, password: string) => {
    if (!login_id.trim() || !password.trim()) {
      setInfo('아이디와 비밀번호를 입력해 주세요.');
      return;
    }

    const duplicated = store.freelancers.some((item) => item.login_id === login_id && item.id !== id);
    if (duplicated) {
      setInfo('이미 사용 중인 로그인 아이디입니다.');
      return;
    }

    setStore((prev) => ({
      ...prev,
      freelancers: prev.freelancers.map((item) =>
        item.id === id ? { ...item, login_id, password } : item,
      ),
    }));
    setInfo('프리랜서 계정이 저장되었습니다.');
  };

  const renderFreelancerTab = () => (
    <div className="grid gap-4 xl:grid-cols-2">
      <form onSubmit={submitFreelancer} className="rounded-2xl border border-[#334155] bg-[#0f172a] p-4">
        <h4 className="mb-3 text-lg font-semibold text-white">프리랜서 등록/수정</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">이름<input className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={freelancerForm.name} onChange={(e) => setFreelancerForm({ ...freelancerForm, name: e.target.value })} /></label>
          <label className="text-sm">주민등록번호<input className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={freelancerForm.rrn} onChange={(e) => setFreelancerForm({ ...freelancerForm, rrn: e.target.value })} placeholder="예: 9001011234567" /></label>
          <label className="text-sm">형태
            <select className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={freelancerForm.type} onChange={(e) => setFreelancerForm({ ...freelancerForm, type: e.target.value as FreelancerType })}>
              <option value="sales">영업</option>
              <option value="production">생산</option>
            </select>
          </label>
          <label className="text-sm">로그인 아이디<input className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={freelancerForm.login_id} onChange={(e) => setFreelancerForm({ ...freelancerForm, login_id: e.target.value })} /></label>
          <label className="text-sm">비밀번호<input type="password" className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={freelancerForm.password} onChange={(e) => setFreelancerForm({ ...freelancerForm, password: e.target.value })} /></label>
          <label className="text-sm">연락처<input className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={freelancerForm.phone} onChange={(e) => setFreelancerForm({ ...freelancerForm, phone: e.target.value })} /></label>
          <label className="text-sm">주소<input className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={freelancerForm.address} onChange={(e) => setFreelancerForm({ ...freelancerForm, address: e.target.value })} /></label>
          <label className="text-sm">은행명<input className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={freelancerForm.bank_name} onChange={(e) => setFreelancerForm({ ...freelancerForm, bank_name: e.target.value })} /></label>
          <label className="text-sm">계좌번호<input className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={freelancerForm.account_number} onChange={(e) => setFreelancerForm({ ...freelancerForm, account_number: e.target.value })} /></label>
        </div>

        <div className="mt-4 flex gap-2">
          <button className="rounded-lg border border-[#1d4ed8] bg-[#1d4ed8] px-3 py-2 text-sm font-semibold text-white">{editingFreelancerId ? '수정 저장' : '등록'}</button>
          {editingFreelancerId ? (
            <button type="button" className="rounded-lg border border-[#334155] px-3 py-2 text-sm" onClick={() => { setEditingFreelancerId(null); setFreelancerForm(EMPTY_FREELANCER_FORM); }}>취소</button>
          ) : null}
        </div>
      </form>

      <div className="rounded-2xl border border-[#334155] bg-[#0f172a] p-4">
        <h4 className="mb-3 text-lg font-semibold text-white">프리랜서 목록</h4>
        <div className="space-y-2">
          {store.freelancers.map((item) => (
            <div key={item.id} className="rounded-xl border border-[#334155] bg-[#111827] p-3">
              <p className="font-semibold text-white">{item.name} <span className="text-sm text-[#94a3b8]">({item.type === 'sales' ? '영업' : '생산'})</span></p>
              <p className="text-sm text-[#94a3b8]">아이디: {item.login_id} / 주민번호: {maskRrn(item.rrn)}</p>
              <p className="text-sm text-[#94a3b8]">{item.phone} / {item.bank_name} {item.account_number}</p>
              <div className="mt-2 flex gap-2">
                <button className="rounded-lg border border-[#334155] px-3 py-1.5 text-sm" onClick={() => editFreelancer(item.id)}>수정</button>
                <button className="rounded-lg border border-[#7f1d1d] px-3 py-1.5 text-sm text-[#fca5a5]" onClick={() => removeFreelancer(item.id)}>삭제</button>
              </div>
            </div>
          ))}
          {store.freelancers.length === 0 ? <p className="text-sm text-[#64748b]">등록된 프리랜서가 없습니다.</p> : null}
        </div>
      </div>
    </div>
  );

  const renderClientProductTab = () => (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={submitClient} className="rounded-2xl border border-[#334155] bg-[#0f172a] p-4">
          <h4 className="mb-3 text-lg font-semibold text-white">{editingClientId ? '거래처 수정' : '거래처 등록'}</h4>
          <div className="grid gap-3">
            <label className="text-sm">거래처명<input className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} /></label>
            <label className="text-sm">주소<input className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={clientForm.address} onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })} /></label>
            <label className="text-sm">연락처<input className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={clientForm.phone} onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })} /></label>
            <label className="text-sm">메모<input className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={clientForm.memo} onChange={(e) => setClientForm({ ...clientForm, memo: e.target.value })} /></label>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="rounded-lg border border-[#1d4ed8] bg-[#1d4ed8] px-3 py-2 text-sm font-semibold text-white">
              {editingClientId ? '수정 저장' : '거래처 저장'}
            </button>
            {editingClientId ? (
              <button
                type="button"
                className="rounded-lg border border-[#334155] px-3 py-2 text-sm"
                onClick={() => {
                  setEditingClientId(null);
                  setClientForm(EMPTY_CLIENT_FORM);
                  setInfo('거래처 수정 모드를 취소했습니다.');
                }}
              >
                취소
              </button>
            ) : null}
          </div>
        </form>

        <form onSubmit={submitProduct} className="rounded-2xl border border-[#334155] bg-[#0f172a] p-4">
          <h4 className="mb-3 text-lg font-semibold text-white">제품 등록</h4>
          <div className="grid gap-3">
            <label className="text-sm">거래처
              <select className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={productForm.client_id} onChange={(e) => setProductForm({ ...productForm, client_id: e.target.value })}>
                <option value="">선택</option>
                {store.clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="text-sm">제품명<input className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} /></label>
            <label className="text-sm">단가(원/kg)<input type="number" className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={productForm.price_per_kg} onChange={(e) => setProductForm({ ...productForm, price_per_kg: e.target.value })} /></label>
            <label className="text-sm">담당 프리랜서(영업)
              <select className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={productForm.freelancer_id} onChange={(e) => setProductForm({ ...productForm, freelancer_id: e.target.value })}>
                <option value="">선택</option>
                {salesFreelancers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>
          <button className="mt-4 rounded-lg border border-[#1d4ed8] bg-[#1d4ed8] px-3 py-2 text-sm font-semibold text-white">제품 저장</button>
        </form>
      </div>

      <div className="rounded-2xl border border-[#334155] bg-[#0f172a] p-4">
        <h4 className="mb-3 text-lg font-semibold text-white">거래처/제품 목록</h4>
        <div className="space-y-3">
          {store.clients.map((client) => {
            const products = store.products.filter((item) => item.client_id === client.id);
            const orderedProducts = sortProductsByOrder(products);
            return (
              <div key={client.id} className="rounded-xl border border-[#334155] bg-[#111827] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{client.name}</p>
                    <p className="text-sm text-[#94a3b8]">{client.address} / {client.phone}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="rounded-lg border border-[#334155] px-3 py-1.5 text-sm" onClick={() => startEditClient(client.id)}>수정</button>
                    <button type="button" className="rounded-lg border border-[#7f1d1d] px-3 py-1.5 text-sm text-[#fca5a5]" onClick={() => removeClient(client.id)}>삭제</button>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {orderedProducts.map((p, index) => {
                    const assignee = store.freelancers.find((f) => f.id === p.freelancer_id);
                    if (editingProductId === p.id) {
                      return (
                        <div key={p.id} className="grid gap-2 rounded-lg border border-[#334155] p-2 md:grid-cols-4">
                          <input className="rounded border border-[#334155] bg-[#0f172a] px-2 py-1" value={productEditForm.name} onChange={(e) => setProductEditForm({ ...productEditForm, name: e.target.value })} placeholder="제품명" />
                          <input type="number" className="rounded border border-[#334155] bg-[#0f172a] px-2 py-1" value={productEditForm.price_per_kg} onChange={(e) => setProductEditForm({ ...productEditForm, price_per_kg: e.target.value })} placeholder="단가" />
                          <select className="rounded border border-[#334155] bg-[#0f172a] px-2 py-1" value={productEditForm.freelancer_id} onChange={(e) => setProductEditForm({ ...productEditForm, freelancer_id: e.target.value })}>
                            <option value="">담당자 선택</option>
                            {salesFreelancers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                          </select>
                          <div className="flex gap-2">
                            <button type="button" className="rounded border border-[#1d4ed8] bg-[#1d4ed8] px-2 py-1 text-sm" onClick={saveProductEdit}>저장</button>
                            <button type="button" className="rounded border border-[#334155] px-2 py-1 text-sm" onClick={() => { setEditingProductId(null); setProductEditForm(EMPTY_PRODUCT_FORM); }}>취소</button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#334155] p-2">
                        <span className="rounded-full border border-[#334155] px-2 py-1 text-xs text-[#94a3b8]">순서 {index + 1}</span>
                        <span className="rounded-full bg-[#1e293b] px-2 py-1 text-sm">{p.name}</span>
                        <span className="text-sm text-[#94a3b8]">{Math.round(p.price_per_kg).toLocaleString('ko-KR')}원/kg</span>
                        <span className="text-sm text-[#94a3b8]">담당: {assignee?.name ?? '-'}</span>
                        <div className="ml-auto flex gap-2">
                          <button type="button" disabled={index === 0} className="rounded border border-[#334155] px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40" onClick={() => moveProductOrder(client.id, p.id, 'up')}>위로</button>
                          <button type="button" disabled={index === orderedProducts.length - 1} className="rounded border border-[#334155] px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40" onClick={() => moveProductOrder(client.id, p.id, 'down')}>아래로</button>
                          <button type="button" className="rounded border border-[#334155] px-2 py-1 text-sm" onClick={() => startEditProduct(p)}>수정</button>
                          <button type="button" className="rounded border border-[#7f1d1d] px-2 py-1 text-sm text-[#fca5a5]" onClick={() => removeProduct(p.id)}>삭제</button>
                        </div>
                      </div>
                    );
                  })}
                  {products.length === 0 ? <p className="text-sm text-[#64748b]">등록된 제품이 없습니다.</p> : null}
                </div>
              </div>
            );
          })}
          {store.clients.length === 0 ? <p className="text-sm text-[#64748b]">등록된 거래처가 없습니다.</p> : null}
        </div>
      </div>
    </div>
  );

  const renderPayTab = () => (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#334155] bg-[#0f172a] p-4">
        <h4 className="mb-3 text-lg font-semibold text-white">{editingPayId ? '수당 수정' : '수당 등록'}</h4>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm">기준 연도<input type="number" className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={payYear} onChange={(e) => setPayYear(Number(e.target.value || 0))} /></label>
          <label className="text-sm">기준 월<input type="number" min={1} max={12} className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={payMonth} onChange={(e) => setPayMonth(Number(e.target.value || 0))} /></label>
          <label className="text-sm md:col-span-2">프리랜서
            <select className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={selectedFreelancerId} onChange={(e) => setSelectedFreelancerId(e.target.value)}>
              <option value="">선택</option>
              {store.freelancers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-[#334155]">
          <div className="hidden grid-cols-5 border-b border-[#334155] bg-[#111827] px-3 py-2 text-xs text-[#94a3b8] md:grid">
            <span>거래처</span><span>제품명</span><span>수량(kg)</span><span>단가(원/kg)</span><span>수당액(원)</span>
          </div>
          <div className="space-y-2 p-2">
            {selectedFreelancerProducts.map((product) => {
              const client = store.clients.find((c) => c.id === product.client_id);
              const qty = Number(quantities[product.id] || 0);
              return (
                <div key={product.id} className="grid gap-2 rounded-lg border border-[#334155] p-2 md:grid-cols-5 md:items-center">
                  <span className="text-sm text-[#cbd5e1]">{client?.name ?? '-'}</span>
                  <span className="text-sm text-white">{product.name}</span>
                  <input type="number" step="0.001" min={0} className="rounded border border-[#334155] bg-[#111827] px-2 py-1" value={qty} onChange={(e) => setQuantities((prev) => ({ ...prev, [product.id]: safeNumber(e.target.value) }))} />
                  <span className="text-sm text-[#94a3b8]">{toCurrency(product.price_per_kg)}</span>
                  <strong className="text-sm text-white">{toCurrency(qty * product.price_per_kg)}</strong>
                </div>
              );
            })}
            {selectedFreelancerProducts.length === 0 ? <p className="text-sm text-[#64748b]">선택한 프리랜서의 제품이 없습니다.</p> : null}
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <div className="rounded-lg border border-[#334155] bg-[#111827] px-3 py-2">총 수당액 <strong>{toCurrency(payCalc.total)}</strong></div>
          <div className="rounded-lg border border-[#334155] bg-[#111827] px-3 py-2">원천징수(3.3%) <strong>{toCurrency(payCalc.withholding)}</strong></div>
          <div className="rounded-lg border border-[#334155] bg-[#111827] px-3 py-2">차인지급액 <strong>{toCurrency(payCalc.net)}</strong></div>
        </div>

        <div className="mt-4 flex gap-2">
          <button className="rounded-lg border border-[#1d4ed8] bg-[#1d4ed8] px-3 py-2 text-sm font-semibold text-white" onClick={savePayRecord}>{editingPayId ? '수정 저장' : '정산 저장'}</button>
          {editingPayId ? <button className="rounded-lg border border-[#334155] px-3 py-2 text-sm" onClick={cancelEditPay}>편집 취소</button> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-[#334155] bg-[#0f172a] p-4">
        <h4 className="mb-3 text-lg font-semibold text-white">저장된 수당 내역</h4>
        <div className="space-y-2">
          {recordsForMonth.map((record) => {
            const freelancer = store.freelancers.find((f) => f.id === record.freelancer_id);
            return (
              <div key={record.id} className="rounded-xl border border-[#334155] bg-[#111827] p-3">
                <p className="font-semibold text-white">{record.year}년 {record.month}월 · {freelancer?.name ?? '-'} · 총 {toCurrency(record.total_amount)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="rounded border border-[#334155] px-2 py-1 text-sm" onClick={() => startEditPay(record.id)}>수정</button>
                  <button className="rounded border border-[#334155] px-2 py-1 text-sm" onClick={() => openPreview(record.id)}>정산서 미리보기</button>
                  <button className="rounded border border-[#1d4ed8] bg-[#1d4ed8] px-2 py-1 text-sm text-white" onClick={() => { openPreview(record.id); setInfo('인쇄 창에서 PDF로 저장할 수 있습니다.'); printStatement(record.id); }}>PDF 저장</button>
                  <button className="rounded border border-[#334155] px-2 py-1 text-sm" onClick={() => { openPreview(record.id); printStatement(record.id); }}>인쇄</button>
                  <button className="rounded border border-[#7f1d1d] px-2 py-1 text-sm text-[#fca5a5]" onClick={() => removePay(record.id)}>삭제</button>
                </div>
              </div>
            );
          })}
          {recordsForMonth.length === 0 ? <p className="text-sm text-[#64748b]">해당 연월의 저장 내역이 없습니다.</p> : null}
        </div>
      </div>

      {previewPayload ? (
        <div className="rounded-2xl border border-[#334155] bg-[#0f172a] p-4">
          <h4 className="no-print mb-3 text-lg font-semibold text-white">정산서 미리보기</h4>
          <StatementPaper
            company={previewPayload.company}
            freelancer={previewPayload.freelancer}
            payRecord={previewPayload.payRecord}
            details={previewPayload.details}
            paymentDate={previewPayload.paymentDate}
          />
        </div>
      ) : null}
    </div>
  );

  const renderSettingsTab = () => (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#1d4ed8] bg-[#0b1730] px-3 py-2 text-xs text-[#93c5fd]">
        회사 정보는 메인 메뉴의 관리자 &gt; 회사정보에서 관리합니다.
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <button className={`rounded-lg border px-3 py-2 text-sm ${settingsTab === 'payment' ? 'border-[#1d4ed8] bg-[#1d4ed8] text-white' : 'border-[#334155]'}`} onClick={() => setSettingsTab('payment')}>지급일 설정</button>
        <button className={`rounded-lg border px-3 py-2 text-sm ${settingsTab === 'admin' ? 'border-[#1d4ed8] bg-[#1d4ed8] text-white' : 'border-[#334155]'}`} onClick={() => setSettingsTab('admin')}>관리자 계정</button>
        <button className={`rounded-lg border px-3 py-2 text-sm ${settingsTab === 'freelancers' ? 'border-[#1d4ed8] bg-[#1d4ed8] text-white' : 'border-[#334155]'}`} onClick={() => setSettingsTab('freelancers')}>프리랜서 계정</button>
      </div>

      {settingsTab === 'payment' ? (
        <div className="rounded-2xl border border-[#334155] bg-[#0f172a] p-4">
          <h4 className="mb-3 text-lg font-semibold text-white">익월 지급일 설정</h4>
          <label className="text-sm">지급일(1~31)
            <input type="number" min={1} max={31} className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={paymentDayInput} onChange={(e) => setPaymentDayInput(Number(e.target.value || 0))} />
          </label>
          <p className="mt-2 text-sm text-[#94a3b8]">예: 기준월 1월 + 설정일 10일 = 2월 10일</p>
          <button className="mt-4 rounded-lg border border-[#1d4ed8] bg-[#1d4ed8] px-3 py-2 text-sm font-semibold text-white" onClick={savePaymentDay}>저장</button>
        </div>
      ) : null}

      {settingsTab === 'admin' ? (
        <div className="rounded-2xl border border-[#334155] bg-[#0f172a] p-4">
          <h4 className="mb-3 text-lg font-semibold text-white">관리자 계정 변경</h4>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">아이디<input className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={adminForm.login_id} onChange={(e) => setAdminForm({ ...adminForm, login_id: e.target.value })} /></label>
            <label className="text-sm">비밀번호<input type="password" className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} /></label>
          </div>
          <button className="mt-4 rounded-lg border border-[#1d4ed8] bg-[#1d4ed8] px-3 py-2 text-sm font-semibold text-white" onClick={saveAdminAccount}>변경</button>
        </div>
      ) : null}

      {settingsTab === 'freelancers' ? (
        <div className="rounded-2xl border border-[#334155] bg-[#0f172a] p-4">
          <h4 className="mb-3 text-lg font-semibold text-white">프리랜서 계정 일괄 관리</h4>
          <div className="space-y-2">
            {accountRows.map((item) => (
              <div key={item.id} className="grid gap-2 rounded-lg border border-[#334155] bg-[#111827] p-3 md:grid-cols-[180px_1fr_1fr_auto] md:items-center">
                <span className="text-sm font-semibold text-white">{item.name}</span>
                <input className="rounded border border-[#334155] bg-[#0f172a] px-2 py-1" value={item.login_id} onChange={(e) => setAccountRows((prev) => prev.map((row) => row.id === item.id ? { ...row, login_id: e.target.value } : row))} />
                <input type="password" className="rounded border border-[#334155] bg-[#0f172a] px-2 py-1" value={item.password} onChange={(e) => setAccountRows((prev) => prev.map((row) => row.id === item.id ? { ...row, password: e.target.value } : row))} />
                <button className="rounded border border-[#1d4ed8] bg-[#1d4ed8] px-2 py-1 text-sm text-white" onClick={() => saveFreelancerAccount(item.id, item.login_id, item.password)}>저장</button>
              </div>
            ))}
            {accountRows.length === 0 ? <p className="text-sm text-[#64748b]">프리랜서가 없습니다.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );

  const tabClass = (tab: AllowanceTabKey) =>
    activeTab === tab
      ? 'border-[#1d4ed8] bg-[#1d4ed8] text-white'
      : 'border-[#334155] bg-transparent text-[#cbd5e1] hover:bg-[#1e293b]';

  return (
    <div className="rounded-2xl border border-[#334155] bg-[#111827] p-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-3xl font-semibold text-white">수당지급 관리</h3>
          <p className="mt-1 text-sm text-[#94a3b8]">실제 CRUD 데이터(브라우저 저장)로 동작하는 통합 관리 화면입니다.</p>
        </div>
        <button className="rounded-lg border border-[#334155] px-3 py-2 text-sm font-semibold text-[#cbd5e1] hover:bg-[#1e293b]" onClick={onMoveToChat}>AI 채팅으로 이동</button>
      </div>

      <div className="no-print mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <button className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${tabClass('freelancer')}`} onClick={() => onChangeTab('freelancer')}>프리랜서 관리</button>
        <button className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${tabClass('client-product')}`} onClick={() => onChangeTab('client-product')}>거래처/제품 관리</button>
        <button className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${tabClass('pay')}`} onClick={() => onChangeTab('pay')}>수당 관리</button>
        <button className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${tabClass('settings')}`} onClick={() => onChangeTab('settings')}>관리자 설정</button>
      </div>

      {notice ? <div className="no-print mt-4 rounded-lg border border-[#1e3a8a] bg-[#0f172a] px-4 py-3 text-sm text-[#bfdbfe]">{notice}</div> : null}

      <div className="mt-4">
        {activeTab === 'freelancer' ? renderFreelancerTab() : null}
        {activeTab === 'client-product' ? renderClientProductTab() : null}
        {activeTab === 'pay' ? renderPayTab() : null}
        {activeTab === 'settings' ? renderSettingsTab() : null}
      </div>
    </div>
  );
}
