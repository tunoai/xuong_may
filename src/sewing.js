// ===== MODULE 3: SEWING KANBAN =====
import { store } from './store.js';
import { showToast, openModal, closeModal, statusBadge, formatDate, formatNumber, SIZES, lotLabel, buildFilterBar } from './ui.js';

const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL'];

export function initSewingModule() {
  const container = document.getElementById('sewing-kanban-container');

  // Build Filter Bar
  const lots = store.getLots();
  const workshops = [...new Set(store.getSewings().map(s => s.workshopName).filter(Boolean))];

  buildFilterBar('sewing-filters', [
    { type: 'datalist', id: 'filter-sewing-lot', label: 'Lô vải', placeholder: 'Gõ để tìm lô...', options: [
      ...lots.map(l => ({ value: l.id, label: `${l.fabricName || ''} - ${l.customerName || ''}` }))
    ]},
    { type: 'datalist', id: 'filter-sewing-workshop', label: 'Xưởng may', placeholder: 'Gõ tên xưởng...', options: [
      ...workshops.map(w => ({ value: w, label: w }))
    ]}
  ]);

  document.getElementById('filter-sewing-lot').addEventListener('input', renderSewingTable);
  document.getElementById('filter-sewing-workshop').addEventListener('input', renderSewingTable);

  // Search filter listener
  const searchInput = document.getElementById('sewing-search');
  if (searchInput) {
    searchInput.addEventListener('input', renderSewingTable);
  }

  // Event Delegation
  container.addEventListener('click', (e) => {
    // Deliver (Giao hàng)
    const deliverBtn = e.target.closest('.btn-sew-deliver');
    if (deliverBtn) {
      e.stopPropagation();
      showDeliveryModal(deliverBtn.dataset.sewingId);
      return;
    }

    // QC (Kiểm tra)
    const qcBtn = e.target.closest('.btn-sew-qc');
    if (qcBtn) {
      e.stopPropagation();
      showQCModal(qcBtn.dataset.deliveryId);
      return;
    }

    // Delete Sewing Card
    const delSewBtn = e.target.closest('.btn-delete-sew');
    if (delSewBtn) {
      e.stopPropagation();
      const id = delSewBtn.dataset.sewingId;
      if (confirm(`Bạn có chắc muốn xóa Nhận Vải Cắt ${id}? Toàn bộ lịch sử giao hàng của thẻ này cũng sẽ bị xóa.`)) {
        store.deleteSewing(id);
        renderSewingTable();
        showToast('Đã xóa dữ liệu', 'info');
      }
      return;
    }

    // Delete Delivery Card
    const delDelBtn = e.target.closest('.btn-delete-delivery');
    if (delDelBtn) {
      e.stopPropagation();
      const id = delDelBtn.dataset.deliveryId;
      if (confirm(`Bạn có chắc muốn xóa thẻ Giao Hàng này?`)) {
        store.deleteDelivery(id);
        renderSewingTable();
        showToast('Đã xóa thẻ Giao Hàng', 'info');
      }
      return;
    }

    // Edit QC
    const editQcBtn = e.target.closest('.btn-edit-qc');
    if (editQcBtn) {
      e.stopPropagation();
      const qc = store.getQC(editQcBtn.dataset.qcId);
      if (qc) showQCModal(qc.deliveryId, qc.id);
      return;
    }

    // Complete Pass (Hoàn thành)
    const completeBtn = e.target.closest('.btn-qc-complete');
    if (completeBtn) {
      e.stopPropagation();
      store.updateQC(completeBtn.dataset.qcId, { passAction: 'Done' });
      renderSewingTable();
      showToast('Đã chuyển vào Lịch sử giao hàng', 'success');
      return;
    }

    // Send to Rework (Gửi trả)
    const reworkBtn = e.target.closest('.btn-qc-rework');
    if (reworkBtn) {
      e.stopPropagation();
      const qcId = reworkBtn.dataset.qcId;
      store.updateQC(qcId, { failAction: 'Sent' });
      store.autoCreateReworks(qcId); // Actually generate reworks
      renderSewingTable();
      showToast('Đã chuyển sang tab HÀNG LỖI', 'warning');
      return;
    }
  });

  window.handleSewingDragStart = (e) => {
    e.dataTransfer.setData('text/plain', e.target.dataset.deliveryId);
    e.target.classList.add('dragging');
  };

  window.handleSewingDragOver = (e) => { e.preventDefault(); };

  window.handleSewingDrop = (e, targetCol) => {
    e.preventDefault();
    const deliveryId = e.dataTransfer.getData('text/plain');
    document.querySelector(`[data-delivery-id="${deliveryId}"]`)?.classList.remove('dragging');
    
    if (!deliveryId) return; // Ignore drag from other boards
    const delivery = store.getDelivery(deliveryId);
    if (!delivery) return;

    if (targetCol === 'qc' && delivery.status === 'Delivery') {
      store.updateDelivery(deliveryId, { status: 'QC' });
      renderSewingTable();
    } else if (targetCol === 'delivery' && delivery.status === 'QC') {
      store.updateDelivery(deliveryId, { status: 'Delivery' });
      renderSewingTable();
    }
  };

  document.addEventListener('dragend', (e) => {
    if (e.target.classList) e.target.classList.remove('dragging');
  });

  renderSewingTable();
}

export function renderSewingTable() {
  const container = document.getElementById('sewing-kanban-container');
  const allSewings = store.getSewings();
  const allDeliveries = store.getDeliveries();

  const searchQuery = document.getElementById('sewing-search')?.value.toLowerCase() || '';
  const filterLotId = document.getElementById('filter-sewing-lot')?.value.toLowerCase() || '';
  const filterWorkshop = document.getElementById('filter-sewing-workshop')?.value.toLowerCase() || '';

  const filterItem = (s) => {
    if (filterLotId) {
      const lot = store.getLot(s.lotId);
      const lotStr = `${s.lotId} ${lot?.fabricName || ''} ${lot?.customerName || ''}`.toLowerCase();
      if (!lotStr.includes(filterLotId)) return false;
    }
    if (filterWorkshop && !(s.workshopName || '').toLowerCase().includes(filterWorkshop)) return false;
    
    if (!searchQuery) return true;
    const lot = store.getLot(s.lotId);
    const textToSearch = `${s.id} ${s.lotId} ${lot?.customerName || ''} ${lot?.fabricName || ''} ${s.workshopName || ''}`.toLowerCase();
    return textToSearch.includes(searchQuery);
  };

  // Column 1: NHẬN VẢI CẮT (Sewings that are not Done)
  const activeSewings = allSewings.filter(s => s.status !== 'Done' && filterItem(s));

  // Column 2: GIAO HÀNG (Deliveries with status 'Delivery')
  const deliveriesPending = allDeliveries.filter(d => {
    if (d.status !== 'Delivery') return false;
    const s = store.getSewing(d.sewingId);
    return s ? filterItem(s) : true;
  });

  // Column 3: QC KIỂM TRA (Deliveries with status 'QC')
  const deliveriesQC = allDeliveries.filter(d => {
    if (d.status !== 'QC') return false;
    const s = store.getSewing(d.sewingId);
    return s ? filterItem(s) : true;
  });

  // Column 4: DUYỆT - TRẢ (QC Records with Pending actions)
  const allQCRecords = store.getQCs();
  const pendingQCRecords = allQCRecords.filter(q => {
    if (q.passAction === 'Pending' || q.failAction === 'Pending') {
      const s = store.getSewing(q.sewingId);
      return s ? filterItem(s) : true;
    }
    return false;
  });

  // Calculate sizes for badges
  const getQCCount = () => {
    let count = 0;
    pendingQCRecords.forEach(q => {
      const results = store.getQCResults(q.id);
      if (q.passAction === 'Pending' && results.some(r => r.passed > 0)) count++;
      if (q.failAction === 'Pending' && results.some(r => r.failed > 0)) count++;
    });
    return count;
  };

  const renderSewingCard = (sewing) => {
    const lot = store.getLot(sewing.lotId);
    const sizes = store.getSewingSizes(sewing.id);
    const prioSizes = lot ? store.getPrioritySizes(lot.id) : [];
    const hasPrio = prioSizes.length > 0;
    
    // Display: sizes Sent vs Returned
    const sizeDisplay = sizes.filter(s => s.quantitySent > 0).map(s => {
      const isPrio = prioSizes.includes(s.size);
      return `<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;${isPrio ? 'background:rgba(245,158,11,0.08);padding:2px 6px;border-radius:3px;border-left:2px solid #f59e0b' : ''}">
        <span><strong>${isPrio ? '⭐ ' : ''}${s.size}</strong></span>
        <span>${s.quantityReturned} / ${s.quantitySent}</span>
      </div>`;
    }).join('');

    return `
      <div class="kanban-card${hasPrio ? ' priority-card' : ''}">
        <div class="kanban-card-title">
          <span>Lô: ${lot ? lot.fabricName + (lot.totalFabric ? ' ' + formatNumber(lot.totalFabric) + 'm' : '') : sewing.lotId}</span>
          <div style="display:flex; gap:6px; align-items:center;">
            <span style="font-size:11px; color:var(--text-muted)">${sewing.id}</span>
            <button class="btn-icon btn-delete-sew" data-sewing-id="${sewing.id}" title="Xóa" style="padding:0; font-size:12px; color:var(--red);">🗑️</button>
          </div>
        </div>
        <div style="font-size:12px; color:var(--text-primary); margin-bottom: 8px;">
          <strong>Khách:</strong> ${lot ? lot.customerName : ''} <br/>
          <strong>Xưởng:</strong> ${sewing.workshopName || ''}
        </div>
        <div style="background:rgba(255,255,255,0.02); padding:8px; border-radius:4px; margin-bottom:8px">
          <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px">TIẾN ĐỘ MAY:</div>
          ${sizeDisplay}
        </div>
        <button class="btn btn-xs btn-primary btn-sew-deliver" data-sewing-id="${sewing.id}" style="width:100%;background:var(--blue);border-color:var(--blue)">📦 Giao Hàng</button>
      </div>
    `;
  };

  const renderDeliveryCard = (delivery, showQCBtn) => {
    const sewing = store.getSewing(delivery.sewingId);
    const lot = store.getLot(sewing?.lotId);
    const sizes = store.getDeliverySizes(delivery.id);
    const prioSizes = lot ? store.getPrioritySizes(lot.id) : [];
    const hasPrioSize = sizes.some(s => prioSizes.includes(s.size));

    const sizeDisplay = sizes.map(s => {
      const isPrio = prioSizes.includes(s.size);
      return `<span class="size-pill${isPrio ? ' priority' : ''}" style="margin-right:4px">${isPrio ? '⭐ ' : ''}${s.size}: ${s.quantity}</span>`;
    }).join('');

    return `
      <div class="kanban-card${hasPrioSize ? ' priority-card' : ''}" draggable="true" data-delivery-id="${delivery.id}" ondragstart="handleSewingDragStart(event)">
        <div class="kanban-card-title">
          <span>Lô: ${lot ? lot.fabricName + (lot.totalFabric ? ' ' + formatNumber(lot.totalFabric) + 'm' : '') : ''}</span>
          <div style="display:flex; gap:6px; align-items:center;">
            <span style="font-size:11px; color:var(--text-muted)">${formatDate(delivery.deliveryDate || delivery.createdAt.split('T')[0])}</span>
            <button class="btn-icon btn-delete-delivery" data-delivery-id="${delivery.id}" title="Xóa" style="padding:0; font-size:12px; color:var(--red);">🗑️</button>
          </div>
        </div>
        <div style="font-size:12px; color:var(--text-primary); margin-bottom: 8px;">
          <strong>Khách:</strong> ${lot ? lot.customerName : ''} <br/>
          <strong>Xưởng:</strong> ${sewing?.workshopName || ''}
        </div>
        <div style="margin-bottom:10px">
          ${sizeDisplay}
        </div>
        ${showQCBtn ? `<button class="btn btn-xs btn-primary btn-sew-qc" data-delivery-id="${delivery.id}" style="width:100%;background:var(--green);border-color:var(--green)">🔍 Nhập QC</button>` : ''}
      </div>
    `;
  };

  const renderQCCard = (qc, type) => {
    const sewing = store.getSewing(qc.sewingId);
    const lot = store.getLot(sewing?.lotId);
    const results = store.getQCResults(qc.id);
    
    const relevantResults = results.filter(r => type === 'Pass' ? r.passed > 0 : r.failed > 0);
    if (relevantResults.length === 0) return '';
    const prioSizes = lot ? store.getPrioritySizes(lot.id) : [];
    const hasPrioSize = relevantResults.some(r => prioSizes.includes(r.size));

    const sizeDisplay = relevantResults.map(r => {
      const isPrio = prioSizes.includes(r.size);
      return `<span class="size-pill${isPrio ? ' priority' : ''}" style="margin-right:4px">${isPrio ? '⭐ ' : ''}${r.size}: ${type === 'Pass' ? r.passed : r.failed}/${r.checked}</span>`;
    }).join('');

    const isPass = type === 'Pass';
    const title = isPass ? `✅ Duyệt` : `❌ Lỗi`;
    const btnClass = isPass ? 'btn-qc-complete' : 'btn-qc-rework';
    const btnText = isPass ? 'Hoàn thành' : 'Gửi trả';
    const btnStyle = isPass ? 'background:var(--green);border-color:var(--green)' : 'background:var(--red);border-color:var(--red)';

    return `
      <div class="kanban-card${hasPrioSize ? ' priority-card' : ''}" style="border-left: 3px solid ${isPass ? 'var(--green)' : 'var(--red)'}">
        <div class="kanban-card-title">
          <span style="color:${isPass ? 'var(--green)' : 'var(--red)'}; font-weight:bold;">${title}</span>
          <div style="display:flex; gap:6px; align-items:center;">
            <span style="font-size:11px; color:var(--text-muted)">${qc.id}</span>
            <button class="btn-icon btn-edit-qc" data-qc-id="${qc.id}" title="Sửa QC" style="padding:0; font-size:12px;">✏️</button>
          </div>
        </div>
        <div style="font-size:12px; color:var(--text-primary); margin-bottom: 8px;">
          <strong>Lô:</strong> ${lot ? lot.fabricName + (lot.totalFabric ? ' ' + formatNumber(lot.totalFabric) + 'm' : '') : ''} <br/>
          <strong>Khách:</strong> ${lot ? lot.customerName : ''} <br/>
          <strong>Xưởng:</strong> ${sewing?.workshopName || ''}
        </div>
        <div style="margin-bottom:10px">
          ${sizeDisplay}
        </div>
        <button class="btn btn-xs btn-primary ${btnClass}" data-qc-id="${qc.id}" style="width:100%;${btnStyle}">${btnText}</button>
      </div>
    `;
  };

  container.innerHTML = `
    <div class="kanban-col" id="col-sewing-received">
      <div class="kanban-col-header" style="border-bottom-color:var(--blue)">
        NHẬN VẢI CẮT - ĐANG MAY <span class="badge" style="background:var(--blue)">${activeSewings.length}</span>
      </div>
      <div class="kanban-cards">
        ${activeSewings.map(s => renderSewingCard(s)).join('')}
        ${activeSewings.length === 0 ? '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px;">Không có vải nhận</div>' : ''}
      </div>
    </div>
    
    <div class="kanban-col" id="col-sewing-delivery" ondragover="handleSewingDragOver(event)" ondrop="handleSewingDrop(event, 'delivery')">
      <div class="kanban-col-header" style="border-bottom-color:var(--orange); flex-direction:column; align-items:flex-start;">
        <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
          <span>MAY XONG</span> <span class="badge" style="background:var(--orange)">${deliveriesPending.length}</span>
        </div>
      </div>
      <div style="font-size:11px; font-style:italic; color:var(--text-muted); padding: 0 12px 8px;">Khi nào tiến hành QC thì kéo sang cột QC</div>
      <div class="kanban-cards">
        ${deliveriesPending.map(d => renderDeliveryCard(d, false)).join('')}
        ${deliveriesPending.length === 0 ? '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px;">Bấm "Giao hàng" để tạo thẻ</div>' : ''}
      </div>
    </div>

    <div class="kanban-col" id="col-sewing-qc" ondragover="handleSewingDragOver(event)" ondrop="handleSewingDrop(event, 'qc')">
      <div class="kanban-col-header" style="border-bottom-color:var(--green)">
        QC KIỂM TRA <span class="badge" style="background:var(--green)">${deliveriesQC.length}</span>
      </div>
      <div class="kanban-cards">
        ${deliveriesQC.map(d => renderDeliveryCard(d, true)).join('')}
        ${deliveriesQC.length === 0 ? '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px;">Kéo thẻ Giao Hàng sang đây</div>' : ''}
      </div>
    </div>

    <div class="kanban-col" id="col-sewing-qc-result">
      <div class="kanban-col-header" style="border-bottom-color:var(--yellow)">
        DUYỆT - TRẢ <span class="badge" style="background:var(--yellow)">${getQCCount()}</span>
      </div>
      <div class="kanban-cards">
        ${pendingQCRecords.map(q => {
          let html = '';
          if (q.passAction === 'Pending') html += renderQCCard(q, 'Pass');
          if (q.failAction === 'Pending') html += renderQCCard(q, 'Fail');
          return html;
        }).join('')}
        ${getQCCount() === 0 ? '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px;">Nhập QC để thẻ hiển thị ở đây</div>' : ''}
      </div>
    </div>
  `;
}

function showDeliveryModal(sewingId) {
  const sewing = store.getSewing(sewingId);
  const sizes = store.getSewingSizes(sewingId);

  const sizeRows = sizes.map(s => {
    const inProg = s.quantitySent - s.quantityReturned;
    return `<tr>
      <td><strong>${s.size}</strong></td>
      <td>${s.quantitySent}</td>
      <td>${s.quantityReturned}</td>
      <td style="color:var(--yellow)">${inProg}</td>
      <td><input type="number" min="0" max="${inProg}" value="0" data-size="${s.size}" class="return-input" /></td>
    </tr>`;
  }).join('');

  const today = new Date().toISOString().split('T')[0];

  openModal(`Tạo Lô Giao Hàng - ${sewingId}`, `
    <div class="form-group" style="margin-bottom:12px;">
      <label>Ngày Gửi Hàng *</label>
      <input type="date" id="delivery-date-input" value="${today}" required style="width:100%" />
    </div>
    <p style="margin-bottom:12px;color:var(--text-secondary);font-size:13px">Nhập số lượng hàng thành phẩm may xong để giao:</p>
    <table class="size-entry-table">
      <thead><tr><th>Size</th><th>Đã Nhận</th><th>Đã Giao</th><th>Đang May</th><th>Giao Lần Này</th></tr></thead>
      <tbody>${sizeRows}</tbody>
    </table>`,
    `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Hủy</button>
     <button class="btn btn-primary" id="btn-confirm-return">Tạo Thẻ Giao Hàng</button>`);

  document.getElementById('btn-confirm-return').addEventListener('click', () => {
    const deliveryDate = document.getElementById('delivery-date-input').value;
    if (!deliveryDate) {
      showToast('Vui lòng chọn ngày gửi hàng', 'error');
      return;
    }

    const updatedSewingSizes = sizes.map(s => {
      const input = document.querySelector(`.return-input[data-size="${s.size}"]`);
      const extra = parseInt(input?.value) || 0;
      return { ...s, quantityReturned: s.quantityReturned + extra, justDelivered: extra };
    });

    const deliverySizes = updatedSewingSizes.filter(s => s.justDelivered > 0).map(s => ({
      size: s.size, quantity: s.justDelivered
    }));

    if (deliverySizes.length === 0) {
      showToast('Vui lòng nhập số lượng ít nhất 1 size', 'error');
      return;
    }

    // Update sewing record
    store.setSewingSizes(sewingId, updatedSewingSizes);
    const allReturned = updatedSewingSizes.every(s => s.quantityReturned >= s.quantitySent);
    if (allReturned) store.updateSewing(sewingId, { status: 'Done' });
    else store.updateSewing(sewingId, { status: 'Partial Return' });

    // Create delivery record
    const delivery = store.addDelivery({ sewingId: sewingId, deliveryDate: deliveryDate });
    store.setDeliverySizes(delivery.id, deliverySizes);

    closeModal();
    renderSewingTable();
    showToast('Đã tạo thẻ giao hàng mới!');
  });
}

function showQCModal(deliveryId, editQcId = null) {
  const delivery = store.getDelivery(deliveryId);
  const sewing = store.getSewing(delivery.sewingId);
  const sizes = store.getDeliverySizes(deliveryId);
  
  let existingResults = [];
  let existingQc = null;
  if (editQcId) {
    existingQc = store.getQC(editQcId);
    existingResults = store.getQCResults(editQcId);
  }

  const sizeRows = sizes.map(s => {
    const existing = existingResults.find(r => r.size === s.size);
    const passQty = existing ? existing.passed : s.quantity;
    const failQty = existing ? existing.failed : 0;

    return `<tr>
      <td><strong>${s.size}</strong></td>
      <td>${s.quantity}</td>
      <td><input type="number" min="0" max="${s.quantity}" value="${passQty}" data-size="${s.size}" class="qc-pass-input" style="border-color:var(--green);background:rgba(34, 197, 94, 0.1)" /></td>
      <td><input type="number" min="0" max="${s.quantity}" value="${failQty}" data-size="${s.size}" class="qc-fail-input" style="border-color:var(--red);background:rgba(239, 68, 68, 0.1)" /></td>
    </tr>`;
  }).join('');

  openModal(editQcId ? `Sửa QC - Thẻ Giao Hàng` : `Kiểm Tra QC - Thẻ Giao Hàng`, `
    <p style="margin-bottom:12px;color:var(--text-secondary);font-size:13px">Nhập kết quả QC cho thẻ giao hàng này:</p>
    <div class="form-group"><label>Kiểm Viên *</label><input type="text" id="qc-inspector" value="${existingQc ? existingQc.inspectorName : ''}" placeholder="Tên kiểm viên" /></div>
    <table class="size-entry-table" style="margin-top:12px">
      <thead><tr><th>Size</th><th>Tổng Giao</th><th>✅ Duyệt (Pass)</th><th>❌ Gửi Trả (Fail)</th></tr></thead>
      <tbody>${sizeRows}</tbody>
    </table>`,
    `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Hủy</button>
     <button class="btn btn-primary" id="btn-confirm-qc">${editQcId ? 'Cập Nhật QC' : 'Hoàn Tất QC'}</button>`);

  // Auto-calculate failed when pass changes, and vice-versa
  document.querySelectorAll('.qc-pass-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const size = e.target.dataset.size;
      const total = parseInt(e.target.max);
      let passQty = parseInt(e.target.value);
      if (passQty > total) { passQty = total; e.target.value = total; }
      if (passQty < 0) { passQty = 0; e.target.value = 0; }
      if (!isNaN(passQty)) {
        const failInput = document.querySelector(`.qc-fail-input[data-size="${size}"]`);
        if (failInput) failInput.value = total - passQty;
      }
    });
  });

  document.querySelectorAll('.qc-fail-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const size = e.target.dataset.size;
      const total = parseInt(e.target.max);
      let failQty = parseInt(e.target.value);
      if (failQty > total) { failQty = total; e.target.value = total; }
      if (failQty < 0) { failQty = 0; e.target.value = 0; }
      if (!isNaN(failQty)) {
        const passInput = document.querySelector(`.qc-pass-input[data-size="${size}"]`);
        if (passInput) passInput.value = total - failQty;
      }
    });
  });

  document.getElementById('btn-confirm-qc').addEventListener('click', () => {
    const inspector = document.getElementById('qc-inspector').value.trim();
    if (!inspector) { showToast('Vui lòng nhập tên kiểm viên', 'error'); return; }

    let valid = true;
    const results = sizes.map(s => {
      const passInput = document.querySelector(`.qc-pass-input[data-size="${s.size}"]`);
      const failInput = document.querySelector(`.qc-fail-input[data-size="${s.size}"]`);
      const passQty = parseInt(passInput?.value) || 0;
      const failQty = parseInt(failInput?.value) || 0;
      if (passQty + failQty !== s.quantity) {
        valid = false;
      }
      return { size: s.size, checked: s.quantity, passed: passQty, failed: failQty };
    });

    if (!valid) {
      showToast('Tổng Duyệt + Gửi Trả phải bằng Tổng Giao', 'error');
      return;
    }

    if (editQcId) {
      store.updateQC(editQcId, { inspectorName: inspector });
      store.setQCResults(editQcId, results);
      showToast('Đã cập nhật kết quả QC!');
    } else {
      // Create QC Record
      const savedQC = store.addQC({
        sewingId: sewing.id,
        deliveryId: delivery.id,
        dateQC: new Date().toISOString().split('T')[0],
        inspectorName: inspector,
        notes: ''
      });
      store.setQCResults(savedQC.id, results);

      // Update delivery status so it disappears from this board
      store.updateDelivery(delivery.id, { status: 'QC_Done' });
      showToast('Đã phân loại thành các thẻ Duyệt/Lỗi thành công!');
    }

    closeModal();
    renderSewingTable();
  });
}
