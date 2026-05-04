import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { api, API_BASE_URL } from './api';
import SettlementStatement from './components/SettlementStatement';

const initialFreelancerForm = {
  name: '', rrn: '', type: 'sales', login_id: '', password: '',
  address: '', phone: '', bank_name: '', account_number: '',
};

const initialCompanyForm = {
  company_name: '', representative: '', business_reg_number: '',
  business_type: '', business_sector: '', address: '', phone: '',
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get('/auth/me');
        setUser(data.user);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const logout = async () => {
    await api.post('/auth/logout', {});
    setUser(null);
  };

  if (loading) return <div className="app-loading">로딩 중...</div>;

  return (
    <div className="app-shell">
      <div className="bg-orb bg-orb-a" />
      <div className="bg-orb bg-orb-b" />
      <div className="bg-orb bg-orb-c" />

      {!user ? (
        <LoginPage onLogin={setUser} error={error} setError={setError} />
      ) : (
        <main className="page-wrap">
          <header className="main-header card">
            <div>
              <p className="pill">내부 전용 시스템</p>
              <h1>수당 지급 관리 플랫폼</h1>
              <p className="muted">소스 제조 공장 프리랜서 정산 관리</p>
            </div>
            <div className="header-right">
              <span className="user-chip">{user.role === 'admin' ? '관리자' : '프리랜서'}: {user.login_id}</span>
              <button className="btn btn-dark" onClick={logout}>로그아웃</button>
            </div>
          </header>

          {user.role === 'admin' ? <AdminDashboard /> : <FreelancerDashboard />}
        </main>
      )}
    </div>
  );
}

function LoginPage({ onLogin, error, setError }) {
  const [form, setForm] = useState({ login_id: '', password: '' });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/auth/login', form);
      const me = await api.get('/auth/me');
      onLogin(me.user);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card card" onSubmit={submit}>
        <p className="pill">통합 로그인</p>
        <h2>정산 시스템 접속</h2>
        <p className="muted">관리자/프리랜서 공통 로그인</p>

        <Input label="아이디" value={form.login_id} onChange={(v) => setForm({ ...form, login_id: v })} />
        <Input label="비밀번호" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />

        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" type="submit">로그인</button>
      </form>
    </div>
  );
}

function AdminDashboard() {
  const [tab, setTab] = useState('freelancers');
  const tabs = [
    ['freelancers', '프리랜서 관리'],
    ['clients', '거래처/제품'],
    ['pay', '수당 관리'],
    ['settings', '관리자 설정'],
  ];

  return (
    <section className="admin-layout">
      <aside className="card side-nav">
        {tabs.map(([key, label]) => (
          <button key={key} className={`side-item ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </aside>
      <div className="content-area">
        {tab === 'freelancers' && <FreelancerAdmin />}
        {tab === 'clients' && <ClientProductAdmin />}
        {tab === 'pay' && <PayAdmin />}
        {tab === 'settings' && <SettingsAdmin />}
      </div>
    </section>
  );
}

function FreelancerAdmin() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(initialFreelancerForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');

  const load = async () => setList(await api.get('/admin/freelancers'));
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const payload = { ...form };
      if (editingId && !payload.rrn) delete payload.rrn;
      if (editingId && !payload.password) delete payload.password;
      if (editingId) await api.put(`/admin/freelancers/${editingId}`, payload);
      else await api.post('/admin/freelancers', payload);
      setForm(initialFreelancerForm);
      setEditingId(null);
      setMessage('저장되었습니다.');
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('연결 데이터가 있으면 삭제되지 않을 수 있습니다. 삭제하시겠습니까?')) return;
    try {
      await api.delete(`/admin/freelancers/${id}`);
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <div className="split-grid">
      <form onSubmit={submit} className="card panel">
        <h3>프리랜서 등록/수정</h3>
        <div className="form-grid two-col">
          <Input label="이름" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Input label="주민등록번호" value={form.rrn} onChange={(v) => setForm({ ...form, rrn: v })} placeholder="예: 9001011234567" />
          <label>형태
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="sales">영업</option>
              <option value="production">생산</option>
            </select>
          </label>
          <Input label="로그인 아이디" value={form.login_id} onChange={(v) => setForm({ ...form, login_id: v })} />
          <Input label="비밀번호" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
          <Input label="연락처" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <Input label="주소" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
          <Input label="은행명" value={form.bank_name} onChange={(v) => setForm({ ...form, bank_name: v })} />
          <Input label="계좌번호" value={form.account_number} onChange={(v) => setForm({ ...form, account_number: v })} />
        </div>

        {message && <p className="info">{message}</p>}
        <div className="row-gap">
          <button className="btn btn-primary">{editingId ? '수정 저장' : '등록'}</button>
          {editingId && <button type="button" className="btn" onClick={() => { setEditingId(null); setForm(initialFreelancerForm); }}>취소</button>}
        </div>
      </form>

      <div className="card panel">
        <h3>프리랜서 목록</h3>
        <div className="list-wrap">
          {list.map((item) => (
            <div key={item.id} className="list-item">
              <div>
                <p className="title">{item.name} <span className="muted">({item.type === 'sales' ? '영업' : '생산'})</span></p>
                <p className="muted">아이디: {item.login_id} / 주민번호: {item.rrn}</p>
                <p className="muted">{item.phone} / {item.bank_name} {item.account_number}</p>
              </div>
              <div className="row-gap">
                <button className="btn" onClick={() => { setEditingId(item.id); setForm({ ...item, rrn: '', password: '' }); }}>수정</button>
                <button className="btn btn-danger" onClick={() => remove(item.id)}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ClientProductAdmin() {
  const [clients, setClients] = useState([]);
  const [salesUsers, setSalesUsers] = useState([]);
  const [clientForm, setClientForm] = useState({ name: '', address: '', phone: '', memo: '' });
  const [productForm, setProductForm] = useState({ client_id: '', name: '', price_per_kg: '', freelancer_id: '' });
  const [editingProductId, setEditingProductId] = useState(null);
  const [productEditForm, setProductEditForm] = useState({ name: '', price_per_kg: '', freelancer_id: '' });
  const [message, setMessage] = useState('');

  const load = async () => {
    const [c, s] = await Promise.all([api.get('/admin/clients'), api.get('/admin/sales-freelancers')]);
    setClients(c); setSalesUsers(s);
  };

  useEffect(() => { load(); }, []);

  const saveClient = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/clients', clientForm);
      setClientForm({ name: '', address: '', phone: '', memo: '' });
      setMessage('거래처가 등록되었습니다.');
      await load();
    } catch (err) { setMessage(err.message); }
  };

  const saveProduct = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/products', {
        ...productForm,
        client_id: Number(productForm.client_id),
        freelancer_id: Number(productForm.freelancer_id),
        price_per_kg: Number(productForm.price_per_kg),
      });
      setProductForm({ client_id: '', name: '', price_per_kg: '', freelancer_id: '' });
      setMessage('제품이 등록되었습니다.');
      await load();
    } catch (err) { setMessage(err.message); }
  };

  const startProductEdit = (product) => {
    setEditingProductId(product.id);
    setProductEditForm({
      name: product.name,
      price_per_kg: String(product.price_per_kg),
      freelancer_id: String(product.freelancer_id),
    });
  };

  const cancelProductEdit = () => {
    setEditingProductId(null);
    setProductEditForm({ name: '', price_per_kg: '', freelancer_id: '' });
  };

  const saveProductEdit = async (productId) => {
    try {
      await api.put(`/admin/products/${productId}`, {
        name: productEditForm.name,
        price_per_kg: Number(productEditForm.price_per_kg),
        freelancer_id: Number(productEditForm.freelancer_id),
      });
      setMessage('제품 정보가 수정되었습니다.');
      cancelProductEdit();
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const deleteProduct = async (productId) => {
    if (!window.confirm('이 제품을 삭제하시겠습니까?')) return;
    try {
      await api.delete(`/admin/products/${productId}`);
      setMessage('제품이 삭제되었습니다.');
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <div className="stack-gap">
      <div className="split-grid">
        <form onSubmit={saveClient} className="card panel">
          <h3>거래처 등록</h3>
          <Input label="거래처명" value={clientForm.name} onChange={(v) => setClientForm({ ...clientForm, name: v })} />
          <Input label="주소" value={clientForm.address} onChange={(v) => setClientForm({ ...clientForm, address: v })} />
          <Input label="연락처" value={clientForm.phone} onChange={(v) => setClientForm({ ...clientForm, phone: v })} />
          <Input label="메모" value={clientForm.memo} onChange={(v) => setClientForm({ ...clientForm, memo: v })} />
          <button className="btn btn-primary">거래처 저장</button>
        </form>

        <form onSubmit={saveProduct} className="card panel">
          <h3>제품 등록</h3>
          <label>거래처
            <select value={productForm.client_id} onChange={(e) => setProductForm({ ...productForm, client_id: e.target.value })}>
              <option value="">선택</option>
              {clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <Input label="제품명" value={productForm.name} onChange={(v) => setProductForm({ ...productForm, name: v })} />
          <Input label="단가(원/kg)" type="number" value={productForm.price_per_kg} onChange={(v) => setProductForm({ ...productForm, price_per_kg: v })} />
          <label>담당 프리랜서(영업)
            <select value={productForm.freelancer_id} onChange={(e) => setProductForm({ ...productForm, freelancer_id: e.target.value })}>
              <option value="">선택</option>
              {salesUsers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <button className="btn btn-primary">제품 저장</button>
        </form>
      </div>

      {message && <p className="info">{message}</p>}

      <div className="card panel">
        <h3>거래처/제품 목록</h3>
        {(clients || []).map((client) => (
          <div key={client.id} className="list-item">
            <div>
              <p className="title">{client.name}</p>
              <p className="muted">{client.address} / {client.phone}</p>
              <div className="product-list">
                {(client.Products || []).map((p) => (
                  <div key={p.id} className="product-row">
                    {editingProductId === p.id ? (
                      <>
                        <input
                          value={productEditForm.name}
                          onChange={(e) => setProductEditForm({ ...productEditForm, name: e.target.value })}
                          placeholder="제품명"
                        />
                        <input
                          type="number"
                          value={productEditForm.price_per_kg}
                          onChange={(e) => setProductEditForm({ ...productEditForm, price_per_kg: e.target.value })}
                          placeholder="단가"
                        />
                        <select
                          value={productEditForm.freelancer_id}
                          onChange={(e) => setProductEditForm({ ...productEditForm, freelancer_id: e.target.value })}
                        >
                          <option value="">담당자 선택</option>
                          {salesUsers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                        <div className="row-gap">
                          <button className="btn btn-primary" onClick={() => saveProductEdit(p.id)}>저장</button>
                          <button className="btn" onClick={cancelProductEdit}>취소</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="tag">{p.name}</span>
                        <span className="muted">{Number(p.price_per_kg).toLocaleString()}원/kg</span>
                        <span className="muted">담당: {p.Freelancer?.name}</span>
                        <div className="row-gap">
                          <button className="btn" onClick={() => startProductEdit(p)}>수정</button>
                          <button className="btn btn-danger" onClick={() => deleteProduct(p.id)}>삭제</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <button className="btn btn-danger" onClick={async () => {
              if (!window.confirm('연결 데이터가 있으면 삭제되지 않을 수 있습니다. 삭제하시겠습니까?')) return;
              try { await api.delete(`/admin/clients/${client.id}`); await load(); } catch (err) { setMessage(err.message); }
            }}>삭제</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function PayAdmin() {
  const [freelancers, setFreelancers] = useState([]);
  const [records, setRecords] = useState([]);
  const [selectedFreelancerId, setSelectedFreelancerId] = useState('');
  const [year, setYear] = useState(dayjs().year());
  const [month, setMonth] = useState(dayjs().month() + 1);
  const [products, setProducts] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [editingRecordId, setEditingRecordId] = useState(null);
  const [editingDetailMap, setEditingDetailMap] = useState(null);
  const [statementRecordId, setStatementRecordId] = useState(null);
  const [statementData, setStatementData] = useState(null);
  const [message, setMessage] = useState('');

  const load = async () => {
    setFreelancers(await api.get('/admin/freelancers'));
    setRecords(await api.get(`/admin/pays?year=${year}&month=${month}`));
  };

  useEffect(() => { load(); }, [year, month]);

  useEffect(() => {
    (async () => {
      if (!selectedFreelancerId) return setProducts([]);
      const data = await api.get(`/admin/freelancer-products/${selectedFreelancerId}`);
      const init = {};
      data.forEach((p) => { init[p.id] = 0; });
      if (editingDetailMap) {
        data.forEach((p) => {
          if (editingDetailMap[p.id] != null) init[p.id] = editingDetailMap[p.id];
        });
      }
      setProducts(data);
      setQuantities(init);
    })();
  }, [selectedFreelancerId, editingDetailMap]);

  useEffect(() => {
    (async () => {
      if (!statementRecordId) return setStatementData(null);
      try {
        const data = await api.get(`/admin/pays/${statementRecordId}/statement`);
        setStatementData(data);
      } catch (err) {
        setMessage(err.message);
      }
    })();
  }, [statementRecordId]);

  const total = useMemo(() => products.reduce((sum, p) => sum + Number(quantities[p.id] || 0) * Number(p.price_per_kg), 0), [products, quantities]);

  const refreshRecords = async () => {
    setRecords(await api.get(`/admin/pays?year=${year}&month=${month}`));
  };

  const startEditRecord = async (recordId) => {
    try {
      const record = await api.get(`/admin/pays/${recordId}`);
      setEditingRecordId(record.id);
      setYear(Number(record.year));
      setMonth(Number(record.month));
      setSelectedFreelancerId(String(record.freelancer_id));
      const map = {};
      (record.PayDetails || []).forEach((d) => { map[d.product_id] = Number(d.quantity_kg); });
      setEditingDetailMap(map);
      setMessage('선택한 정산 내역이 편집 모드로 로드되었습니다.');
    } catch (err) {
      setMessage(err.message);
    }
  };

  const cancelEditRecord = () => {
    setEditingRecordId(null);
    setEditingDetailMap(null);
    setMessage('편집 모드를 취소했습니다.');
  };

  const savePayRecord = async () => {
    try {
      const details = products.map((p) => ({ product_id: p.id, quantity_kg: Number(quantities[p.id] || 0) })).filter((d) => d.quantity_kg > 0);
      if (!selectedFreelancerId || details.length === 0) return setMessage('프리랜서 선택과 수량 입력이 필요합니다.');

      if (editingRecordId) {
        await api.put(`/admin/pays/${editingRecordId}`, {
          freelancer_id: Number(selectedFreelancerId),
          year: Number(year),
          month: Number(month),
          details,
        });
        setMessage('정산 내역이 수정되었습니다.');
      } else {
        await api.post('/admin/pays', {
          freelancer_id: Number(selectedFreelancerId),
          year: Number(year),
          month: Number(month),
          details,
        });
        setMessage('정산 내역이 저장되었습니다.');
      }

      setEditingRecordId(null);
      setEditingDetailMap(null);
      await refreshRecords();
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <div className="stack-gap">
      <div className="card panel">
        <h3>{editingRecordId ? '수당 수정' : '수당 등록'}</h3>
        <div className="form-grid four-col">
          <Input label="기준 연도" type="number" value={year} onChange={(v) => setYear(Number(v))} />
          <Input label="기준 월" type="number" value={month} onChange={(v) => setMonth(Number(v))} />
          <label className="span-2">프리랜서
            <select value={selectedFreelancerId} onChange={(e) => setSelectedFreelancerId(e.target.value)}>
              <option value="">선택</option>
              {freelancers.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
        </div>

        <div className="table-like">
          {products.map((p) => (
            <div key={p.id} className="table-row">
              <span>{p.Client?.name}</span>
              <span>{p.name}</span>
              <input type="number" min={0} step="0.001" value={quantities[p.id] || 0} onChange={(e) => setQuantities({ ...quantities, [p.id]: e.target.value })} />
              <span>{Number(p.price_per_kg).toLocaleString()}원</span>
              <strong>{(Number(quantities[p.id] || 0) * Number(p.price_per_kg)).toLocaleString()}원</strong>
            </div>
          ))}
        </div>

        <div className="summary-box">
          <p>총 수당액 <strong>{total.toLocaleString()}원</strong></p>
          <p>원천징수(3.3%) <strong>{(total * 0.033).toLocaleString()}원</strong></p>
          <p>차인지급액 <strong>{(total - total * 0.033).toLocaleString()}원</strong></p>
        </div>

        <div className="row-gap">
          <button className="btn btn-primary" onClick={savePayRecord}>{editingRecordId ? '수정 저장' : '정산 저장'}</button>
          {editingRecordId && <button className="btn" onClick={cancelEditRecord}>편집 취소</button>}
        </div>
        {message && <p className="info">{message}</p>}
      </div>

      <div className="card panel">
        <h3>저장된 수당 내역</h3>
        {records.map((r) => (
          <div key={r.id} className="list-item">
            <p className="title">{r.year}년 {r.month}월 · {r.Freelancer?.name} · 총 {Number(r.total_amount).toLocaleString()}원</p>
            <div className="row-gap">
              <button className="btn" onClick={() => startEditRecord(r.id)}>수정</button>
              <button className="btn" onClick={() => setStatementRecordId(r.id)}>정산서 미리보기</button>
              <a className="btn" href={`${API_BASE_URL}/admin/pays/${r.id}/pdf`} target="_blank" rel="noreferrer">PDF 저장</a>
              <button className="btn" onClick={async () => { setStatementRecordId(r.id); setTimeout(() => window.print(), 120); }}>인쇄</button>
              <button className="btn btn-danger" onClick={async () => {
                if (!window.confirm('정산 내역을 삭제하시겠습니까?')) return;
                await api.delete(`/admin/pays/${r.id}`);
                if (statementRecordId === r.id) {
                  setStatementRecordId(null);
                  setStatementData(null);
                }
                await refreshRecords();
              }}>삭제</button>
            </div>
          </div>
        ))}
      </div>

      {statementData && (
        <div className="card panel">
          <h3>정산서 미리보기</h3>
          <SettlementStatement
            company={statementData.company}
            freelancer={statementData.freelancer}
            payRecord={statementData.payRecord}
            details={statementData.details || []}
            paymentDate={statementData.paymentDate}
          />
        </div>
      )}
    </div>
  );
}

function SettingsAdmin() {
  const [tab, setTab] = useState('company');
  return (
    <div className="stack-gap">
      <div className="card mini-tabs">
        <button className={tab === 'company' ? 'active' : ''} onClick={() => setTab('company')}>회사 정보</button>
        <button className={tab === 'payment' ? 'active' : ''} onClick={() => setTab('payment')}>지급일 설정</button>
        <button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>관리자 계정</button>
        <button className={tab === 'freelancers' ? 'active' : ''} onClick={() => setTab('freelancers')}>프리랜서 계정</button>
      </div>
      {tab === 'company' && <CompanySettings />}
      {tab === 'payment' && <PaymentSettings />}
      {tab === 'admin' && <AdminAccountSettings />}
      {tab === 'freelancers' && <FreelancerAccountSettings />}
    </div>
  );
}

function CompanySettings() {
  const [form, setForm] = useState(initialCompanyForm);
  const [message, setMessage] = useState('');
  useEffect(() => { (async () => setForm(await api.get('/admin/settings/company-info')))(); }, []);

  return (
    <form className="card panel" onSubmit={async (e) => {
      e.preventDefault();
      try { await api.put('/admin/settings/company-info', form); setMessage('저장되었습니다.'); }
      catch (err) { setMessage(err.message); }
    }}>
      <h3>회사 정보</h3>
      <div className="form-grid two-col">
        <Input label="회사명" value={form.company_name || ''} onChange={(v) => setForm({ ...form, company_name: v })} />
        <Input label="대표자" value={form.representative || ''} onChange={(v) => setForm({ ...form, representative: v })} />
        <Input label="사업자등록번호" value={form.business_reg_number || ''} onChange={(v) => setForm({ ...form, business_reg_number: v })} />
        <Input label="업태" value={form.business_type || ''} onChange={(v) => setForm({ ...form, business_type: v })} />
        <Input label="업종" value={form.business_sector || ''} onChange={(v) => setForm({ ...form, business_sector: v })} />
        <Input label="연락처" value={form.phone || ''} onChange={(v) => setForm({ ...form, phone: v })} />
        <label className="span-2">주소
          <input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </label>
      </div>
      {message && <p className="info">{message}</p>}
      <button className="btn btn-primary">저장</button>
    </form>
  );
}

function PaymentSettings() {
  const [day, setDay] = useState(25);
  const [message, setMessage] = useState('');
  useEffect(() => { (async () => { const c = await api.get('/admin/settings/system-config'); setDay(c.payment_day); })(); }, []);
  return (
    <div className="card panel">
      <h3>익월 지급일 설정</h3>
      <Input label="지급일(1~31)" type="number" value={day} onChange={setDay} />
      <p className="muted">예: 기준월 1월 + 설정일 10일 = 2월 10일 표시</p>
      {message && <p className="info">{message}</p>}
      <button className="btn btn-primary" onClick={async () => {
        try { await api.put('/admin/settings/system-config', { payment_day: Number(day) }); setMessage('저장되었습니다.'); }
        catch (err) { setMessage(err.message); }
      }}>저장</button>
    </div>
  );
}

function AdminAccountSettings() {
  const [form, setForm] = useState({ login_id: '', password: '' });
  const [message, setMessage] = useState('');
  return (
    <div className="card panel">
      <h3>관리자 계정 변경</h3>
      <Input label="새 아이디" value={form.login_id} onChange={(v) => setForm({ ...form, login_id: v })} />
      <Input label="새 비밀번호" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
      {message && <p className="info">{message}</p>}
      <button className="btn btn-primary" onClick={async () => {
        try { await api.put('/admin/settings/admin-account', form); setMessage('변경되었습니다.'); }
        catch (err) { setMessage(err.message); }
      }}>변경</button>
    </div>
  );
}

function FreelancerAccountSettings() {
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState('');
  const load = async () => setUsers((await api.get('/admin/freelancers')).map((u) => ({ ...u, new_login_id: u.login_id, new_password: '' })));
  useEffect(() => { load(); }, []);

  return (
    <div className="card panel">
      <h3>프리랜서 계정 일괄 관리</h3>
      {message && <p className="info">{message}</p>}
      {users.map((u, i) => (
        <div key={u.id} className="list-item">
          <p className="title">{u.name}</p>
          <div className="row-gap">
            <input value={u.new_login_id} onChange={(e) => { const n = [...users]; n[i].new_login_id = e.target.value; setUsers(n); }} />
            <input type="password" placeholder="새 비밀번호" value={u.new_password} onChange={(e) => { const n = [...users]; n[i].new_password = e.target.value; setUsers(n); }} />
            <button className="btn btn-primary" onClick={async () => {
              try {
                await api.put(`/admin/freelancers/${u.id}/account`, { login_id: u.new_login_id, password: u.new_password });
                setMessage(`${u.name} 계정이 변경되었습니다.`);
                await load();
              } catch (err) { setMessage(err.message); }
            }}>저장</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function FreelancerDashboard() {
  const [year, setYear] = useState(dayjs().year());
  const [month, setMonth] = useState(dayjs().month() + 1);
  const [records, setRecords] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [statement, setStatement] = useState(null);

  useEffect(() => { (async () => setRecords(await api.get(`/freelancer/pays?year=${year}&month=${month}`)))(); }, [year, month]);
  useEffect(() => {
    (async () => {
      if (!selectedId) return setStatement(null);
      setStatement(await api.get(`/freelancer/pays/${selectedId}`));
    })();
  }, [selectedId]);

  return (
    <div className="stack-gap">
      <div className="card panel">
        <h3>정산서 조회</h3>
        <div className="form-grid four-col">
          <Input label="연도" type="number" value={year} onChange={(v) => setYear(Number(v))} />
          <Input label="월" type="number" value={month} onChange={(v) => setMonth(Number(v))} />
          <label className="span-2">정산서 선택
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">선택</option>
              {records.map((r) => <option key={r.id} value={r.id}>{r.year}년 {r.month}월 - {Number(r.net_amount).toLocaleString()}원</option>)}
            </select>
          </label>
        </div>
        <div className="row-gap">
          <button className="btn" onClick={() => window.print()}>인쇄</button>
          {selectedId && <a className="btn btn-primary" href={`${API_BASE_URL}/freelancer/pays/${selectedId}/pdf`} target="_blank" rel="noreferrer">PDF 저장</a>}
        </div>
      </div>

      {statement ? (
        <SettlementStatement
          company={statement.company}
          freelancer={statement.freelancer}
          payRecord={statement.payRecord}
          details={statement.details || []}
          paymentDate={statement.paymentDate}
        />
      ) : (
        <div className="card panel">정산서를 선택해 주세요.</div>
      )}
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <label>
      {label}
      <input type={type} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export default App;
