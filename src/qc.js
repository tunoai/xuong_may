// ===== MODULE 4: QC =====
import { store } from './store.js';
import { showToast, openModal, closeModal, formatDate, formatNumber, buildFilterBar, SIZES, lotLabel } from './ui.js';

export function initQCModule() {
  buildFilterBar('qc-filters', [
    { type: 'select', id: 'filter-qc-sewing', label: 'Đơn may', options: [
      { value: '', label: 'Tất cả' },
      ...store.getSewings().map(s => {
        const lot = store.getLot(s.lotId);
        return { value: s.id, label: `${s.id} (${lot ? lotLabel(lot) : s.lotId})` };
      })
    ]}
  ]);

  document.getElementById('filter-qc-sewing').addEventListener('change', renderQCTable);
  document.getElementById('btn-add-qc').addEventListener('click', showAddQCModal);
  renderQCTable();
}

export function renderQCTable() {
  const sewingFilter = document.getElementById('filter-qc-sewing')?.value;
  let qcs = store.getQCs();
  if (sewingFilter) qcs = qcs.filter(q => q.sewingId === sewingFilter);
  const allQCs = store.getQCs();

  const container = document.getElementById('qc-table-container');

  // Stats
  let allChecked = 0, allPassed = 0, allFailed = 0;
  allQCs.forEach(q => {
    const r = store.getQCResults(q.id);
    allChecked += r.reduce((s, x) => s + x.checked, 0);
    allPassed += r.reduce((s, x) => s + x.passed, 0);
    allFailed += r.reduce((s, x) => s + x.failed, 0);
  });
  const defectRate = allChecked > 0 ? ((allFailed / allChecked) * 100).toFixed(1) : '0.0';

  const statsHTML = `<div class="stat-row">
    <div class="stat-card blue"><div class="stat-label">Tổng Sản Lượng Kiểm</div><div class="stat-value">${formatNumber(allChecked)}</div></div>
    <div class="stat-card green"><div class="stat-label">Số Lượng Đạt (Pass)</div><div class="stat-value">${formatNumber(allPassed)}</div></div>
    <div class="stat-card red"><div class="stat-label">Tỷ Lệ Lỗi (Defect Rate)</div><div class="stat-value">${defectRate}%</div></div>
    <div class="stat-card orange"><div class="stat-label">Tổng Phiếu QC</div><div class="stat-value">${allQCs.length}</div></div>
  </div>`;

  if (qcs.length === 0) {
    container.innerHTML = statsHTML + `<div class="empty-state"><div class="empty-icon">✅</div><p>Chưa có phiếu QC nào.</p></div>`;
    return;
  }

  const rows = qcs.map(q => {
    const results = store.getQCResults(q.id);
    const totalChecked = results.reduce((s, r) => s + r.checked, 0);
    const totalPassed = results.reduce((s, r) => s + r.passed, 0);
    const totalFailed = results.reduce((s, r) => s + r.failed, 0);

    const sewing = store.getSewing(q.sewingId);
    const lot = sewing ? store.getLot(sewing.lotId) : null;

    const statusLabel = totalFailed > 0 && totalPassed > 0 ? `<span class="badge badge-done">HOÀN TẤT</span>` :
      totalPassed > 0 ? `<span class="badge badge-done">HOÀN TẤT</span>` :
      `<span class="badge badge-cutting">ĐANG KIỂM</span>`;

    return `<tr data-qc-id="${q.id}">
      <td><strong>${q.id}</strong></td>
      <td>${lot ? lot.id : '—'}<div style="font-size:11px;color:var(--text-muted)">${lot ? lot.customerName : ''}</div></td>
      <td>${formatNumber(totalChecked)}</td>
      <td style="color:var(--green);font-weight:600">${formatNumber(totalPassed)}</td>
      <td style="color:${totalFailed > 0 ? 'var(--red)' : 'var(--text-muted)'}; font-weight:600">${totalFailed > 0 ? formatNumber(totalFailed) : '—'}</td>
      <td>${formatDate(q.dateQC)}</td>
      <td>${statusLabel}</td>
      <td>
        <button class="btn-icon btn-edit-qc" data-id="${q.id}" title="Sửa">✏️</button>
      </td>
    </tr>`;
  }).join('');

  container.innerHTML = statsHTML + `<div class="table-wrapper"><table>
    <thead><tr>
      <th>Mã QC</th><th>Mã Lô</th><th>Số Lượng Giao</th>
      <th>Đã Duyệt (Pass)</th><th>Lỗi Trả Về</th><th>Ngày Kiểm</th><th>Trạng Thái</th><th>Hành Động</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;

  container.querySelectorAll('.btn-edit-qc').forEach(btn => {
    btn.addEventListener('click', () => showEditQCModal(btn.dataset.id));
  });
  container.querySelectorAll('tr[data-qc-id]').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      showQCDetail(tr.dataset.qcId);
    });
  });
}

function qcFormHTML(qc = {}, existingResults = []) {
  const sewings = store.getSewings();
  const sewOpts = sewings.map(s => {
    const lot = store.getLot(s.lotId);
    const label = `${s.id} | ${s.workshopName} | ${lot ? lotLabel(lot) : s.lotId}`;
    return `<option value="${s.id}" ${qc.sewingId === s.id ? 'selected' : ''}>${label}</option>`;
  }).join('');

  // Determine initial sewing to pre-fill sizes
  const initialSewingId = qc.sewingId || (sewings.length > 0 ? sewings[0].id : '');

  return `<div class="form-grid">
    <div class="form-group"><label>Đơn May *</label><select id="qc-sewing">${sewOpts}</select></div>
    <div class="form-group"><label>Ngày QC *</label><input type="date" id="qc-date" value="${qc.dateQC || new Date().toISOString().split('T')[0]}" /></div>
    <div class="form-group"><label>Kiểm Viên *</label><input type="text" id="qc-inspector" value="${qc.inspectorName || ''}" /></div>
    <div class="form-group full"><label>Ghi Chú</label><textarea id="qc-notes">${qc.notes || ''}</textarea></div>
  </div>
  <div style="margin-top:16px">
    <h4 style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">KẾT QUẢ KIỂM THEO SIZE</h4>
    <p style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Số lượng tự điền từ hàng may trả về. Bạn có thể sửa. Passed + Failed = Checked.</p>
    <div id="qc-size-table-container"></div>
  </div>`;
}

function buildQCSizeTable(sewingId, existingResults = []) {
  const sizes = store.getSewingSizes(sewingId);
  const sewing = store.getSewing(sewingId);
  const lot = sewing ? store.getLot(sewing.lotId) : null;
  const prioSizes = lot ? store.getPrioritySizes(lot.id) : [];

  // Get already QC'd quantities for this sewing (from OTHER QC records)
  const existingQCs = store.getQCsBySewing(sewingId);

  const sizeRows = sizes.filter(s => s.quantityReturned > 0).map(s => {
    const existing = existingResults.find(r => r.size === s.size);
    const isPrio = prioSizes.includes(s.size);
    const defaultQty = existing ? existing.checked : s.quantityReturned;
    const passedVal = existing ? existing.passed : 0;
    const failedVal = existing ? existing.failed : 0;

    return `<tr style="${isPrio ? 'background:rgba(255,170,0,0.08)' : ''}">
      <td><strong>${isPrio ? '⭐ ' : ''}${s.size}</strong></td>
      <td style="font-size:12px;color:var(--text-muted)">${s.quantityReturned}</td>
      <td><input type="number" min="0" value="${defaultQty}" data-size="${s.size}" class="qc-checked" /></td>
      <td><input type="number" min="0" value="${passedVal}" data-size="${s.size}" class="qc-passed" /></td>
      <td><input type="number" min="0" value="${failedVal}" data-size="${s.size}" class="qc-failed" /></td>
    </tr>`;
  }).join('');

  return `<table class="size-entry-table">
    <thead><tr><th>Size</th><th>Nhận Từ May</th><th>Kiểm</th><th>Đạt</th><th>Lỗi</th></tr></thead>
    <tbody>${sizeRows}</tbody>
  </table>`;
}

function setupQCAutoCalc() {
  document.querySelectorAll('.qc-passed, .qc-failed').forEach(input => {
    input.addEventListener('input', () => {
      const size = input.dataset.size;
      const passed = parseInt(document.querySelector(`.qc-passed[data-size="${size}"]`).value) || 0;
      const failed = parseInt(document.querySelector(`.qc-failed[data-size="${size}"]`).value) || 0;
      document.querySelector(`.qc-checked[data-size="${size}"]`).value = passed + failed;
    });
  });
}

function getQCFormData() {
  const results = [];
  document.querySelectorAll('.qc-checked').forEach(input => {
    const size = input.dataset.size;
    const checked = parseInt(input.value) || 0;
    const passed = parseInt(document.querySelector(`.qc-passed[data-size="${size}"]`)?.value) || 0;
    const failed = parseInt(document.querySelector(`.qc-failed[data-size="${size}"]`)?.value) || 0;
    if (checked > 0 || passed > 0 || failed > 0) {
      results.push({ size, checked: passed + failed, passed, failed });
    }
  });
  return {
    qc: {
      sewingId: document.getElementById('qc-sewing').value,
      dateQC: document.getElementById('qc-date').value,
      inspectorName: document.getElementById('qc-inspector').value.trim(),
      notes: document.getElementById('qc-notes').value.trim()
    },
    results
  };
}

function setupSewingChangeListener(existingResults = []) {
  const select = document.getElementById('qc-sewing');
  const container = document.getElementById('qc-size-table-container');

  function updateTable() {
    container.innerHTML = buildQCSizeTable(select.value, existingResults);
    setupQCAutoCalc();
  }

  select.addEventListener('change', updateTable);
  updateTable();
}

function showAddQCModal() {
  if (store.getSewings().length === 0) { showToast('Vui lòng thêm đơn may trước', 'error'); return; }

  openModal('Thêm Phiếu QC', qcFormHTML(),
    `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Hủy</button>
     <button class="btn btn-primary" id="btn-save-qc">Lưu</button>`);

  setupSewingChangeListener();

  document.getElementById('btn-save-qc').addEventListener('click', () => {
    const { qc, results } = getQCFormData();
    if (!qc.sewingId || !qc.inspectorName) { showToast('Vui lòng điền đầy đủ', 'error'); return; }
    const saved = store.addQC(qc);
    store.setQCResults(saved.id, results);
    store.autoCreateReworks(saved.id);
    closeModal();
    renderQCTable();
    showToast('Đã thêm phiếu QC! Hàng lỗi đã tự động tạo trong tab Hàng Lỗi.');
  });
}

function showEditQCModal(qcId) {
  const qc = store.getQC(qcId);
  if (!qc) return;
  const existingResults = store.getQCResults(qcId);

  openModal(`Sửa ${qcId}`, qcFormHTML(qc, existingResults),
    `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Hủy</button>
     <button class="btn btn-primary" id="btn-update-qc">Cập Nhật</button>`);

  setupSewingChangeListener(existingResults);

  document.getElementById('btn-update-qc').addEventListener('click', () => {
    const { qc: data, results } = getQCFormData();
    store.updateQC(qcId, data);
    store.setQCResults(qcId, results);
    store.autoCreateReworks(qcId);
    closeModal();
    renderQCTable();
    showToast('Đã cập nhật phiếu QC!');
  });
}

function showQCDetail(qcId) {
  const qc = store.getQC(qcId);
  if (!qc) return;
  const results = store.getQCResults(qcId);
  const sewing = store.getSewing(qc.sewingId);
  const lot = sewing ? store.getLot(sewing.lotId) : null;
  const prioSizes = lot ? store.getPrioritySizes(lot.id) : [];
  const totalChecked = results.reduce((s, r) => s + r.checked, 0);
  const totalPassed = results.reduce((s, r) => s + r.passed, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);

  const sizeRows = results.map(r => {
    const isPrio = prioSizes.includes(r.size);
    return `<tr style="${isPrio ? 'background:rgba(255,170,0,0.08)' : ''}">
      <td><strong>${isPrio ? '⭐ ' : ''}${r.size}</strong></td><td>${r.checked}</td>
      <td style="color:var(--green)">${r.passed}</td>
      <td style="color:var(--red)">${r.failed}</td></tr>`;
  }).join('');

  openModal(`Chi Tiết: ${qcId}`, `
    <div class="detail-section">
      <div class="detail-info-grid">
        <div class="detail-info-item"><div class="label">Đơn May</div><div class="value">${qc.sewingId}</div></div>
        <div class="detail-info-item"><div class="label">Lô Vải</div><div class="value">${lot ? lotLabel(lot) : '—'}</div></div>
        <div class="detail-info-item"><div class="label">Ngày QC</div><div class="value">${formatDate(qc.dateQC)}</div></div>
        <div class="detail-info-item"><div class="label">Kiểm Viên</div><div class="value">${qc.inspectorName}</div></div>
        <div class="detail-info-item"><div class="label">Tổng Kiểm</div><div class="value">${totalChecked}</div></div>
        <div class="detail-info-item"><div class="label">Đạt</div><div class="value" style="color:var(--green)">${totalPassed}</div></div>
        <div class="detail-info-item"><div class="label">Lỗi</div><div class="value" style="color:var(--red)">${totalFailed}</div></div>
      </div>
    </div>
    ${results.length > 0 ? `<div class="detail-section"><h4>Kết Quả Theo Size</h4>
      <div class="table-wrapper"><table>
        <thead><tr><th>Size</th><th>Kiểm</th><th>Đạt</th><th>Lỗi</th></tr></thead>
        <tbody>${sizeRows}</tbody>
      </table></div>
    </div>` : ''}
    ${qc.notes ? `<div class="detail-section"><h4>Ghi Chú</h4><p>${qc.notes}</p></div>` : ''}
  `, `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Đóng</button>`);
}
