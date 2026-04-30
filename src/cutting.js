// ===== MODULE 2: CUTTING =====
import { store } from './store.js';
import { showToast, openModal, closeModal, statusBadge, formatDate, formatNumber, buildFilterBar, SIZES, lotLabel } from './ui.js';

export function initCuttingModule() {
  buildFilterBar('cutting-filters', [
    { type: 'select', id: 'filter-cutting-lot', label: 'Lô vải', options: [
      { value: '', label: 'Tất cả' },
      ...store.getLots().map(l => ({ value: l.id, label: lotLabel(l) }))
    ]}
  ]);

  document.getElementById('filter-cutting-lot').addEventListener('change', renderCuttingTable);
  document.getElementById('btn-import-cutting').addEventListener('click', showAddCuttingModal);
  document.getElementById('btn-export-cutting').addEventListener('click', showExportCuttingModal);
  renderCuttingTable();
}

export function renderCuttingTable() {
  const lotFilter = document.getElementById('filter-cutting-lot')?.value;
  let cuttings = store.getCuttings().filter(c => !c.isExported);
  if (lotFilter) cuttings = cuttings.filter(c => c.lotId === lotFilter);
  const allCuttings = store.getCuttings();

  const container = document.getElementById('cutting-table-container');

  // Stats
  const totalFabric = cuttings.reduce((s, c) => s + (c.fabricSent || 0), 0);
  const totalPcs = cuttings.reduce((s, c) => s + store.getCuttingSizes(c.id).reduce((ss, sz) => ss + sz.quantity, 0), 0);
  const activeLots = [...new Set(cuttings.map(c => c.lotId))].length;

  const statsHTML = `<div class="stat-row">
    <div class="stat-card blue"><div class="stat-label">Tổng Mét Vải Gửi</div><div class="stat-value">${formatNumber(totalFabric)}<span class="stat-unit"> m</span></div></div>
    <div class="stat-card orange"><div class="stat-label">Tổng Sản Phẩm Cắt</div><div class="stat-value">${formatNumber(totalPcs)}<span class="stat-unit"> PCS</span></div></div>
    <div class="stat-card green"><div class="stat-label">Lô Vải Đang Cắt</div><div class="stat-value">${activeLots}<span class="stat-unit"> Lô</span></div></div>
  </div>`;

  if (cuttings.length === 0) {
    container.innerHTML = statsHTML + `<div class="empty-state"><div class="empty-icon">✂️</div><p>Chưa có phiếu cắt nào.</p></div>`;
    return;
  }

  const rows = cuttings.map(c => {
    const sizes = store.getCuttingSizes(c.id);
    const totalQty = sizes.reduce((s, sz) => s + sz.quantity, 0);
    const lot = store.getLot(c.lotId);
    const prioSizes = store.getPrioritySizes(c.lotId);

    const sizePills = sizes.filter(s => s.quantity > 0).map(s => {
      const isPrio = prioSizes.includes(s.size);
      return `<span class="size-pill${isPrio ? ' prio' : ''}">${isPrio ? '⭐' : ''}${s.size}:${s.quantity}</span>`;
    }).join('');

    return `<tr data-cutting-id="${c.id}">
      <td><strong>${c.id}</strong></td>
      <td>${lot ? lot.customerName : c.lotId}<div style="font-size:11px;color:var(--text-muted)">${lot ? lot.fabricName : ''}</div></td>
      <td>${formatDate(c.dateSent)}</td>
      <td>${formatNumber(c.fabricSent)} m</td>
      <td>${formatNumber(totalQty)} pcs</td>
      <td style="white-space:normal;max-width:280px">${sizePills || '—'}</td>
      <td>${c.notes || '—'}</td>
      <td>
        <button class="btn btn-xs btn-primary btn-transfer-cut" data-id="${c.id}" style="margin-right:4px;">Chuyển</button>
        <button class="btn-icon btn-edit-cutting" data-id="${c.id}" title="Sửa">✏️</button>
        <button class="btn-icon btn-delete-cutting" data-id="${c.id}" title="Xóa">🗑️</button>
      </td>
    </tr>`;
  }).join('');

  container.innerHTML = statsHTML + `<div class="table-wrapper"><table>
    <thead><tr>
      <th>Mã Cắt</th><th>Lô Vải</th><th>Ngày Cắt</th><th>Vải Gửi</th>
      <th>Tổng Cắt</th><th>Nhập số cắt</th><th>Ghi Chú</th><th></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;

  container.querySelectorAll('.btn-edit-cutting').forEach(btn => {
    btn.addEventListener('click', () => showEditCuttingModal(btn.dataset.id));
  });

  container.querySelectorAll('.btn-delete-cutting').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Xóa mã cắt này?')) { store.deleteCutting(btn.dataset.id); renderCuttingTable(); showToast('Đã xóa phiếu cắt', 'info'); }
    });
  });

  container.querySelectorAll('.btn-transfer-cut').forEach(btn => {
    btn.addEventListener('click', () => {
      showExportCuttingModal(btn.dataset.id);
    });
  });

  container.querySelectorAll('tr[data-cutting-id]').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      showCuttingDetail(tr.dataset.cuttingId);
    });
  });
}

function cuttingFormHTML(cutting = {}, existingSizes = []) {
  const lots = store.getLots();
  const lotOpts = lots.map(l => `<option value="${l.id}" ${cutting.lotId === l.id ? 'selected' : ''}>${lotLabel(l)}</option>`).join('');
  const currentLotId = cutting.lotId || (lots.length > 0 ? lots[0].id : '');
  const prioSizes = store.getPrioritySizes(currentLotId);

  const sizeRows = SIZES.map(size => {
    const existing = existingSizes.find(s => s.size === size);
    const qty = existing ? existing.quantity : 0;
    const isPrio = prioSizes.includes(size);
    return `<tr>
      <td><strong>${size}</strong></td>
      <td><input type="number" min="0" value="${qty}" data-size="${size}" class="cutting-size-input" /></td>
      <td style="text-align:center"><input type="checkbox" data-size="${size}" class="cutting-prio-input" ${isPrio ? 'checked' : ''} title="Ưu tiên" /></td>
    </tr>`;
  }).join('');

  return `<div class="form-grid">
    <div class="form-group"><label>Lô Vải *</label><select id="cutting-lot">${lotOpts}</select></div>
    <div class="form-group"><label>Ngày Gửi Cắt *</label><input type="date" id="cutting-date-sent" value="${cutting.dateSent || new Date().toISOString().split('T')[0]}" /></div>
    <div class="form-group"><label>Vải Gửi (mét) *</label><input type="number" id="cutting-fabric" min="0" step="0.1" value="${cutting.fabricSent || ''}" /></div>
    <div class="form-group"><label>Ngày Nhận Lại</label><input type="date" id="cutting-date-returned" value="${cutting.dateReturned || ''}" /></div>
    <div class="form-group full"><label>Ghi Chú</label><textarea id="cutting-notes">${cutting.notes || ''}</textarea></div>
  </div>
  <div style="margin-top:16px">
    <h4 style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">SỐ LƯỢNG CẮT THEO SIZE</h4>
    <table class="size-entry-table"><thead><tr><th>Size</th><th>Số Lượng</th><th>⭐ Ưu Tiên</th></tr></thead><tbody>${sizeRows}</tbody></table>
  </div>`;
}

function getCuttingFormData() {
  const sizes = [];
  document.querySelectorAll('.cutting-size-input').forEach(input => {
    const qty = parseInt(input.value) || 0;
    if (qty > 0) sizes.push({ size: input.dataset.size, quantity: qty });
  });

  const prioSizes = [];
  document.querySelectorAll('.cutting-prio-input').forEach(cb => {
    if (cb.checked) prioSizes.push(cb.dataset.size);
  });

  return {
    cutting: {
      lotId: document.getElementById('cutting-lot').value,
      dateSent: document.getElementById('cutting-date-sent').value,
      fabricSent: parseFloat(document.getElementById('cutting-fabric').value) || 0,
      dateReturned: document.getElementById('cutting-date-returned').value,
      notes: document.getElementById('cutting-notes').value.trim()
    },
    sizes,
    prioSizes
  };
}

export function showAddCuttingModal(defaultLotId = null) {
  if (store.getLots().length === 0) { showToast('Vui lòng thêm lô vải trước', 'error'); return; }

  const defaultData = defaultLotId ? { lotId: defaultLotId } : {};

  openModal('Thêm Phiếu Cắt', cuttingFormHTML(defaultData),
    `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Hủy</button>
     <button class="btn btn-primary" id="btn-save-cutting">Lưu</button>`);

  document.getElementById('btn-save-cutting').addEventListener('click', () => {
    const { cutting, sizes, prioSizes } = getCuttingFormData();
    if (!cutting.lotId || !cutting.fabricSent) { showToast('Vui lòng điền đầy đủ thông tin', 'error'); return; }
    const saved = store.addCutting(cutting);
    store.setCuttingSizes(saved.id, sizes);
    store.setPrioritySizes(cutting.lotId, prioSizes);
    closeModal();
    renderCuttingTable();
    showToast('Đã thêm phiếu cắt!');
  });
}

function showEditCuttingModal(cuttingId) {
  const cutting = store.getCutting(cuttingId);
  if (!cutting) return;
  const existingSizes = store.getCuttingSizes(cuttingId);

  openModal(`Sửa ${cuttingId}`, cuttingFormHTML(cutting, existingSizes),
    `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Hủy</button>
     <button class="btn btn-primary" id="btn-update-cutting">Cập Nhật</button>`);

  document.getElementById('btn-update-cutting').addEventListener('click', () => {
    const { cutting: data, sizes, prioSizes } = getCuttingFormData();
    store.updateCutting(cuttingId, data);
    store.setCuttingSizes(cuttingId, sizes);
    store.setPrioritySizes(data.lotId, prioSizes);
    closeModal();
    renderCuttingTable();
    showToast('Đã cập nhật phiếu cắt!');
  });
}

function showCuttingDetail(cuttingId) {
  const cutting = store.getCutting(cuttingId);
  if (!cutting) return;
  const sizes = store.getCuttingSizes(cuttingId);
  const lot = store.getLot(cutting.lotId);
  const totalQty = sizes.reduce((s, sz) => s + sz.quantity, 0);

  const sizeRows = sizes.map(s => `<tr><td><strong>${s.size}</strong></td><td>${s.quantity}</td></tr>`).join('');

  openModal(`Chi Tiết: ${cuttingId}`, `
    <div class="detail-section">
      <div class="detail-info-grid">
        <div class="detail-info-item"><div class="label">Lô Vải</div><div class="value">${cutting.lotId}${lot ? ` - ${lot.customerName}` : ''}</div></div>
        <div class="detail-info-item"><div class="label">Vải Gửi</div><div class="value">${formatNumber(cutting.fabricSent)} m</div></div>
        <div class="detail-info-item"><div class="label">Ngày Gửi</div><div class="value">${formatDate(cutting.dateSent)}</div></div>
        <div class="detail-info-item"><div class="label">Ngày Nhận</div><div class="value">${formatDate(cutting.dateReturned)}</div></div>
        <div class="detail-info-item"><div class="label">Tổng Cắt</div><div class="value">${formatNumber(totalQty)} pcs</div></div>
      </div>
    </div>
    ${sizes.length > 0 ? `<div class="detail-section"><h4>Chi Tiết Size</h4>
      <div class="table-wrapper"><table><thead><tr><th>Size</th><th>Số Lượng</th></tr></thead><tbody>${sizeRows}</tbody></table></div>
    </div>` : ''}
    ${cutting.notes ? `<div class="detail-section"><h4>Ghi Chú</h4><p>${cutting.notes}</p></div>` : ''}
  `, `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Đóng</button>`);
}

// ===== XUẤT CẮT → Tự động tạo đơn may =====
export function showExportCuttingModal(defaultCuttingId = null) {
  const cuttings = store.getCuttings().filter(c => !c.isExported);
  if (cuttings.length === 0) { showToast('Chưa có phiếu cắt nào để xuất', 'error'); return; }

  const cutOpts = cuttings.map(c => {
    const lot = store.getLot(c.lotId);
    const sizes = store.getCuttingSizes(c.id);
    const totalQty = sizes.reduce((s, sz) => s + sz.quantity, 0);
    const isSelected = c.id === defaultCuttingId ? 'selected' : '';
    return `<option value="${c.id}" ${isSelected}>${c.id} | ${lot ? lot.customerName : c.lotId} | ${lot ? lot.fabricName : ''} | ${totalQty} pcs</option>`;
  }).join('');

  openModal('📤 Xuất Cắt → Gửi May', `
    <p style="margin-bottom:12px;color:var(--text-muted);font-size:12px">Chọn phiếu cắt để xuất. Số lượng sẽ tự động tạo đơn may mới.</p>
    <div class="form-grid">
      <div class="form-group"><label>Phiếu Cắt *</label><select id="export-cut-id">${cutOpts}</select></div>
      <div class="form-group"><label>Xưởng May *</label><input type="text" id="export-cut-workshop" value="" placeholder="Tên xưởng may" /></div>
      <div class="form-group"><label>Ngày Gửi *</label><input type="date" id="export-cut-date" value="${new Date().toISOString().split('T')[0]}" /></div>
      <div class="form-group"><label>Ghi Chú</label><input type="text" id="export-cut-notes" value="" /></div>
    </div>
    <div style="margin-top:16px">
      <h4 style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">SỐ LƯỢNG XUẤT THEO SIZE</h4>
      <div id="export-cut-size-container"></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Hủy</button>
     <button class="btn btn-primary" id="btn-confirm-export-cut" style="background:var(--orange);border-color:var(--orange)">📤 Xuất Cắt</button>`);

  function renderExportSizes() {
    const cuttingId = document.getElementById('export-cut-id').value;
    const cutting = store.getCutting(cuttingId);
    const sizes = store.getCuttingSizes(cuttingId);
    const lotId = cutting ? cutting.lotId : '';
    const prioSizes = store.getPrioritySizes(lotId);

    const sizeRows = sizes.filter(s => s.quantity > 0).map(s => {
      const isPrio = prioSizes.includes(s.size);
      return `<tr style="${isPrio ? 'background:rgba(255,170,0,0.1);border-left:3px solid var(--yellow)' : ''}">
        <td><strong style="${isPrio ? 'color:var(--yellow)' : ''}">${isPrio ? '⭐ ' : ''}${s.size}</strong></td>
        <td><input type="number" min="0" max="${s.quantity}" value="${s.quantity}" data-size="${s.size}" class="export-cut-size-qty" style="${isPrio ? 'border-color:var(--yellow);background:rgba(255,170,0,0.05)' : ''}" /></td>
        <td style="font-size:11px;color:var(--text-muted)">/ ${s.quantity}</td>
      </tr>`;
    }).join('');

    document.getElementById('export-cut-size-container').innerHTML = sizeRows ?
      `<table class="size-entry-table"><thead><tr><th>Size</th><th>Số Lượng Xuất</th><th>Tối Đa</th></tr></thead><tbody>${sizeRows}</tbody></table>` :
      '<p style="color:var(--text-muted);font-size:12px">Phiếu cắt này chưa có size nào.</p>';
  }

  document.getElementById('export-cut-id').addEventListener('change', renderExportSizes);
  renderExportSizes();

  document.getElementById('btn-confirm-export-cut').addEventListener('click', () => {
    const cuttingId = document.getElementById('export-cut-id').value;
    const workshop = document.getElementById('export-cut-workshop').value.trim();
    const dateSent = document.getElementById('export-cut-date').value;
    const notes = document.getElementById('export-cut-notes').value.trim();

    if (!workshop) { showToast('Vui lòng nhập tên xưởng may', 'error'); return; }

    const cutting = store.getCutting(cuttingId);
    if (!cutting) return;

    const sizes = [];
    document.querySelectorAll('.export-cut-size-qty').forEach(input => {
      const qty = parseInt(input.value) || 0;
      if (qty > 0) sizes.push({ size: input.dataset.size, quantitySent: qty, quantityReturned: 0 });
    });

    if (sizes.length === 0) { showToast('Chưa có size nào để xuất', 'error'); return; }

    const saved = store.addSewing({
      lotId: cutting.lotId,
      sourceCuttingId: cuttingId,
      workshopName: workshop,
      dateSent: dateSent,
      notes: notes ? `Xuất từ ${cuttingId} — ${notes}` : `Xuất từ ${cuttingId}`
    });
    store.setSewingSizes(saved.id, sizes);
    store.markCuttingExported(cuttingId);

    closeModal();
    renderCuttingTable();
    const totalExported = sizes.reduce((s, sz) => s + sz.quantitySent, 0);
    showToast(`✅ Đã xuất ${totalExported} pcs → ${saved.id} (Tab May)`);
  });
}
