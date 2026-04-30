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
    // Batch Deliver (Nhập hàng may xong)
    const batchDeliverBtn = e.target.closest('.btn-batch-deliver');
    if (batchDeliverBtn) {
      e.stopPropagation();
      showBatchDeliveryModal();
      return;
    }

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

    // Edit Sewing Card
    const editSewBtn = e.target.closest('.btn-edit-sew');
    if (editSewBtn) {
      e.stopPropagation();
      showEditSewingModal(editSewBtn.dataset.sewingId);
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

    // Edit Grouped Delivery Card
    const editGroupBtn = e.target.closest('.btn-edit-group-delivery');
    if (editGroupBtn) {
      e.stopPropagation();
      showEditGroupedDeliveryModal(editGroupBtn.dataset.groupDate);
      return;
    }

    // Edit Delivery Card (individual - from QC column)
    const editDelBtn = e.target.closest('.btn-edit-delivery');
    if (editDelBtn) {
      e.stopPropagation();
      showEditDeliveryModal(editDelBtn.dataset.deliveryId);
      return;
    }

    // Delete Delivery Card
    const delDelBtn = e.target.closest('.btn-delete-delivery');
    if (delDelBtn) {
      e.stopPropagation();
      const id = delDelBtn.dataset.deliveryId;
      if (confirm(`Bạn có chắc muốn xóa thẻ Giao Hàng này?`)) {
        const delivery = store.getDelivery(id);
        const delSizes = store.getDeliverySizes(id);
        const sewingSizes = store.getSewingSizes(delivery.sewingId);
        
        delSizes.forEach(ds => {
          const ss = sewingSizes.find(s => s.size === ds.size);
          if (ss) ss.quantityReturned = Math.max(0, ss.quantityReturned - ds.quantity);
        });
        store.setSewingSizes(delivery.sewingId, sewingSizes);
        store.deleteDelivery(id);

        const allReturned = sewingSizes.every(s => s.quantityReturned >= s.quantitySent);
        store.updateSewing(delivery.sewingId, { status: allReturned ? 'Done' : 'Partial Return' });

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
    const card = e.target.closest('[data-delivery-id]');
    if (!card) return;
    e.dataTransfer.setData('text/plain', card.dataset.deliveryId);
    e.dataTransfer.setData('application/group-date', card.dataset.groupDate || '');
    card.classList.add('dragging');
  };

  window.handleSewingDragOver = (e) => { e.preventDefault(); };

  window.handleSewingDrop = (e, targetCol) => {
    e.preventDefault();
    const deliveryId = e.dataTransfer.getData('text/plain');
    const groupDate = e.dataTransfer.getData('application/group-date');
    document.querySelector(`[data-delivery-id="${deliveryId}"]`)?.classList.remove('dragging');
    
    if (!deliveryId) return;
    const delivery = store.getDelivery(deliveryId);
    if (!delivery) return;

    if (groupDate) {
      const allDels = store.getDeliveries();
      const groupDels = allDels.filter(d => {
        const dk = d.deliveryDate || d.createdAt.split('T')[0];
        return dk === groupDate && d.status === delivery.status;
      });
      if (targetCol === 'qc' && delivery.status === 'Delivery') {
        groupDels.forEach(d => store.updateDelivery(d.id, { status: 'QC' }));
        renderSewingTable();
      } else if (targetCol === 'delivery' && delivery.status === 'QC') {
        groupDels.forEach(d => store.updateDelivery(d.id, { status: 'Delivery' }));
        renderSewingTable();
      }
    } else {
      if (targetCol === 'qc' && delivery.status === 'Delivery') {
        store.updateDelivery(deliveryId, { status: 'QC' });
        renderSewingTable();
      } else if (targetCol === 'delivery' && delivery.status === 'QC') {
        store.updateDelivery(deliveryId, { status: 'Delivery' });
        renderSewingTable();
      }
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
            <button class="btn-icon btn-edit-sew" data-sewing-id="${sewing.id}" title="Sửa" style="padding:0; font-size:12px; color:var(--text-muted);">✏️</button>
            <button class="btn-icon btn-delete-sew" data-sewing-id="${sewing.id}" title="Xóa" style="padding:0; font-size:12px; color:var(--red);">🗑️</button>
          </div>
        </div>
        <div style="font-size:12px; color:var(--text-primary); margin-bottom: 8px;">
          <strong>Ngày nhận:</strong> ${sewing.dateSent ? formatDate(sewing.dateSent) : ''} <br/>
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
            <button class="btn-icon btn-edit-delivery" data-delivery-id="${delivery.id}" title="Sửa" style="padding:0; font-size:12px; color:var(--text-muted);">✏️</button>
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
        <button class="btn btn-xs btn-batch-deliver" style="margin-top:6px;width:100%;background:linear-gradient(135deg,#f59e0b,#ef4444);border:none;color:#fff;font-weight:600;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;gap:4px;transition:all .2s;box-shadow:0 2px 8px rgba(245,158,11,0.3)">📋 Nhập hàng may xong</button>
      </div>
      <div style="font-size:11px; font-style:italic; color:var(--text-muted); padding: 0 12px 8px;">Khi nào tiến hành QC thì kéo sang cột QC</div>
      <div class="kanban-cards">
        ${renderGroupedDeliveries(deliveriesPending)}
        ${deliveriesPending.length === 0 ? '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px;">Bấm "Nhập hàng may xong" để tạo thẻ</div>' : ''}
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

    // Auto-consume materials from inventory (Kho Phụ Liệu)
    const totalDelivered = deliverySizes.reduce((s, x) => s + x.quantity, 0);
    const sewing = store.getSewing(sewingId);
    if (sewing && totalDelivered > 0) {
      store.consumeMaterialsForLot(sewing.lotId, totalDelivered);
    }

    closeModal();
    renderSewingTable();
    showToast('Đã tạo thẻ giao hàng mới và cập nhật tồn kho phụ liệu!');
  });
}

function showEditSewingModal(sewingId) {
  const sewing = store.getSewing(sewingId);
  const sizes = store.getSewingSizes(sewingId);
  
  const sizeRows = sizes.map(s => {
    return `<tr>
      <td><strong>${s.size}</strong></td>
      <td><input type="number" min="0" value="${s.quantitySent}" data-size="${s.size}" class="sewing-sent-input" style="width:100%" /></td>
    </tr>`;
  }).join('');

  openModal(`Sửa thẻ Nhận Vải Cắt - ${sewingId}`, `
    <div class="form-group" style="margin-bottom:12px;">
      <label>Tên Xưởng May</label>
      <input type="text" id="sewing-workshop-input" value="${sewing.workshopName || ''}" style="width:100%" />
    </div>
    <p style="margin-bottom:12px;color:var(--text-secondary);font-size:13px">Sửa số lượng vải cắt đã nhận:</p>
    <table class="size-entry-table">
      <thead><tr><th>Size</th><th>Số Lượng Nhận</th></tr></thead>
      <tbody>${sizeRows}</tbody>
    </table>`,
    `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Hủy</button>
     <button class="btn btn-primary" id="btn-save-sewing">Lưu Thay Đổi</button>`);

  document.getElementById('btn-save-sewing').addEventListener('click', () => {
    const workshopName = document.getElementById('sewing-workshop-input').value.trim();
    const updatedSizes = sizes.map(s => {
      const input = document.querySelector(`.sewing-sent-input[data-size="${s.size}"]`);
      return { ...s, quantitySent: parseInt(input?.value) || 0 };
    });

    store.updateSewing(sewingId, { workshopName });
    store.setSewingSizes(sewingId, updatedSizes);
    
    closeModal();
    renderSewingTable();
    showToast('Đã cập nhật thẻ Nhận Vải Cắt!');
  });
}

function showEditDeliveryModal(deliveryId) {
  const delivery = store.getDelivery(deliveryId);
  const sewing = store.getSewing(delivery.sewingId);
  const delSizes = store.getDeliverySizes(deliveryId);
  
  const sizeRows = delSizes.map(s => {
    return `<tr>
      <td><strong>${s.size}</strong></td>
      <td><input type="number" min="0" value="${s.quantity}" data-size="${s.size}" class="del-qty-input" style="width:100%" /></td>
    </tr>`;
  }).join('');

  const today = delivery.deliveryDate || delivery.createdAt.split('T')[0];

  openModal(`Sửa Lô Giao Hàng - ${deliveryId}`, `
    <div class="form-group" style="margin-bottom:12px;">
      <label>Ngày Gửi Hàng *</label>
      <input type="date" id="edit-delivery-date" value="${today}" required style="width:100%" />
    </div>
    <p style="margin-bottom:12px;color:var(--text-secondary);font-size:13px">Sửa số lượng giao hàng:</p>
    <table class="size-entry-table">
      <thead><tr><th>Size</th><th>Số Lượng Giao</th></tr></thead>
      <tbody>${sizeRows}</tbody>
    </table>`,
    `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Hủy</button>
     <button class="btn btn-primary" id="btn-save-delivery">Lưu Thay Đổi</button>`);

  document.getElementById('btn-save-delivery').addEventListener('click', () => {
    const deliveryDate = document.getElementById('edit-delivery-date').value;
    if (!deliveryDate) {
      showToast('Vui lòng chọn ngày gửi hàng', 'error'); return;
    }

    const sewingSizes = store.getSewingSizes(sewing.id);

    // Calculate diffs and update
    const updatedDelSizes = delSizes.map(ds => {
      const input = document.querySelector(`.del-qty-input[data-size="${ds.size}"]`);
      const newQty = parseInt(input?.value) || 0;
      
      // Update sewing sizes
      const ss = sewingSizes.find(s => s.size === ds.size);
      if (ss) {
        ss.quantityReturned = Math.max(0, ss.quantityReturned - ds.quantity + newQty);
      }
      return { size: ds.size, quantity: newQty };
    });

    store.updateDelivery(deliveryId, { deliveryDate });
    store.setDeliverySizes(deliveryId, updatedDelSizes);
    store.setSewingSizes(sewing.id, sewingSizes);

    // Check if status needs to change
    const allReturned = sewingSizes.every(s => s.quantityReturned >= s.quantitySent);
    if (allReturned) store.updateSewing(sewing.id, { status: 'Done' });
    else store.updateSewing(sewing.id, { status: 'Partial Return' });

    closeModal();
    renderSewingTable();
    showToast('Đã cập nhật thẻ Giao Hàng!');
  });
}

function showEditGroupedDeliveryModal(groupDate) {
  // Find all deliveries for this date
  const allDeliveries = store.getDeliveries();
  const groupDeliveries = allDeliveries.filter(d => {
    const dk = d.deliveryDate || d.createdAt.split('T')[0];
    return dk === groupDate && d.status === 'Delivery';
  });

  if (groupDeliveries.length === 0) { showToast('Không tìm thấy thẻ giao hàng', 'error'); return; }

  // Build editable rows per delivery
  const rowsData = groupDeliveries.map(d => {
    const sewing = store.getSewing(d.sewingId);
    const lot = sewing ? store.getLot(sewing.lotId) : null;
    const sizes = store.getDeliverySizes(d.id);
    const productName = lot ? (lot.fabricName || '') + (lot.color ? ' ' + lot.color : '') : d.sewingId;
    const customerName = lot ? lot.customerName : '';
    const sizeMap = {};
    sizes.forEach(s => { sizeMap[s.size] = s.quantity; });
    return { deliveryId: d.id, sewingId: d.sewingId, productName, customerName, sizeMap };
  });

  // Collect all sizes used
  const allSizesUsed = new Set();
  rowsData.forEach(r => Object.keys(r.sizeMap).forEach(s => allSizesUsed.add(s)));
  const sizeOrder = ALL_SIZES.filter(s => allSizesUsed.has(s));
  if (sizeOrder.length === 0) sizeOrder.push(...ALL_SIZES);

  const headerCells = sizeOrder.map(s => `<th style="padding:6px 8px;font-size:12px;color:#b8a07a;font-weight:600;text-align:center;">${s}</th>`).join('');

  const bodyRows = rowsData.map((r, idx) => {
    const cells = sizeOrder.map(s => {
      const qty = r.sizeMap[s] || 0;
      return `<td style="padding:4px 6px;text-align:center;">
        <input type="number" min="0" value="${qty}" 
          class="group-edit-input" data-idx="${idx}" data-size="${s}"
          style="width:52px;text-align:center;padding:4px;border-radius:4px;border:1px solid rgba(245,158,11,0.2);background:rgba(30,30,50,0.9);color:#e8d5b0;font-size:12px;" />
      </td>`;
    }).join('');
    return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05)">
      <td style="padding:6px 8px;">
        <div style="font-size:13px;font-weight:600;color:var(--orange)">${r.productName}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${r.customerName}</div>
      </td>
      ${cells}
    </tr>`;
  }).join('');

  openModal(`✏️ Sửa Giao Hàng - ${formatDate(groupDate)}`, `
    <div style="margin-bottom:16px;">
      <label style="font-size:13px;color:var(--text-secondary);font-weight:600;display:block;margin-bottom:6px;">Ngày giao hàng</label>
      <input type="date" id="group-edit-date" value="${groupDate}" required style="width:200px;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:var(--bg-secondary);color:var(--text-primary);font-size:13px;" />
    </div>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="border-bottom:1px solid rgba(255,255,255,0.1)">
          <th style="padding:6px 8px;font-size:12px;color:#b8a07a;font-weight:600;text-align:left;min-width:160px;">Lô vải / Sản phẩm</th>
          ${headerCells}
        </tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `,
  `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Hủy</button>
   <button class="btn btn-primary" id="btn-save-group-edit" style="background:var(--orange);border-color:var(--orange);">💾 Lưu Thay Đổi</button>`);

  document.getElementById('btn-save-group-edit').addEventListener('click', () => {
    const newDate = document.getElementById('group-edit-date').value;
    if (!newDate) { showToast('Vui lòng chọn ngày', 'error'); return; }

    rowsData.forEach((r, idx) => {
      const sewingSizes = store.getSewingSizes(r.sewingId);
      const oldDelSizes = store.getDeliverySizes(r.deliveryId);
      const newDelSizes = [];

      sizeOrder.forEach(size => {
        const input = document.querySelector(`.group-edit-input[data-idx="${idx}"][data-size="${size}"]`);
        const newQty = parseInt(input?.value) || 0;
        const oldQty = oldDelSizes.find(s => s.size === size)?.quantity || 0;

        // Update sewing quantityReturned
        const ss = sewingSizes.find(s => s.size === size);
        if (ss) {
          ss.quantityReturned = Math.max(0, ss.quantityReturned - oldQty + newQty);
        }
        if (newQty > 0) newDelSizes.push({ size, quantity: newQty });
      });

      store.updateDelivery(r.deliveryId, { deliveryDate: newDate });
      store.setDeliverySizes(r.deliveryId, newDelSizes);
      store.setSewingSizes(r.sewingId, sewingSizes);

      // Update sewing status
      const updatedSewSizes = store.getSewingSizes(r.sewingId);
      const allReturned = updatedSewSizes.every(s => s.quantityReturned >= s.quantitySent);
      store.updateSewing(r.sewingId, { status: allReturned ? 'Done' : 'Partial Return' });
    });

    closeModal();
    renderSewingTable();
    showToast('Đã cập nhật thẻ giao hàng! ✅');
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
      store.updateQC(editQcId, {});
      store.setQCResults(editQcId, results);
      showToast('Đã cập nhật kết quả QC!');
    } else {
      // Create QC Record
      const savedQC = store.addQC({
        sewingId: sewing.id,
        deliveryId: delivery.id,
        dateQC: new Date().toISOString().split('T')[0],
        inspectorName: '',
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

// === GROUPED DELIVERY RENDERING (by date) ===
function renderGroupedDeliveries(deliveries) {
  if (deliveries.length === 0) return '';
  const groups = {};
  deliveries.forEach(d => {
    const dateKey = d.deliveryDate || d.createdAt.split('T')[0];
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(d);
  });
  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  return sortedDates.map(dateKey => {
    const group = groups[dateKey];
    const rows = [];
    group.forEach(d => {
      const sewing = store.getSewing(d.sewingId);
      const lot = sewing ? store.getLot(sewing.lotId) : null;
      const sizes = store.getDeliverySizes(d.id);
      const productName = lot ? (lot.fabricName || '') + (lot.color ? ' ' + lot.color : '') : d.sewingId;
      const customerName = lot ? lot.customerName : '';
      const sizeMap = {};
      sizes.forEach(s => { sizeMap[s.size] = s.quantity; });
      rows.push({ deliveryId: d.id, productName, customerName, sizeMap });
    });

    const allSizesUsed = new Set();
    rows.forEach(r => Object.keys(r.sizeMap).forEach(s => allSizesUsed.add(s)));
    const sizeOrder = ALL_SIZES.filter(s => allSizesUsed.has(s));

    const headerCells = sizeOrder.map(s => `<th style="padding:4px 8px;font-size:11px;color:var(--text-muted);font-weight:600;text-align:center;">${s}</th>`).join('');
    const bodyRows = rows.map(r => {
      const cells = sizeOrder.map(s => {
        const qty = r.sizeMap[s] || 0;
        return `<td style="padding:3px 8px;text-align:center;font-size:12px;${qty > 0 ? 'color:var(--text-primary);font-weight:500' : 'color:var(--text-muted);opacity:0.3'}">${qty > 0 ? qty : ''}</td>`;
      }).join('');
      return `<tr>
        <td style="padding:3px 8px;font-size:12px;color:var(--text-primary);max-width:140px;overflow:hidden;text-overflow:ellipsis;" title="${r.productName} - ${r.customerName}">
          <span style="font-weight:500">${r.productName}</span>
          ${r.customerName ? `<br/><span style="font-size:10px;color:var(--text-muted)">${r.customerName}</span>` : ''}
        </td>${cells}</tr>`;
    }).join('');

    const totalRow = sizeOrder.map(s => {
      const total = rows.reduce((sum, r) => sum + (r.sizeMap[s] || 0), 0);
      return `<td style="padding:4px 8px;text-align:center;font-size:12px;font-weight:700;color:var(--orange);border-top:1px solid rgba(255,255,255,0.1)">${total > 0 ? total : ''}</td>`;
    }).join('');
    const grandTotal = rows.reduce((sum, r) => sum + Object.values(r.sizeMap).reduce((a, b) => a + b, 0), 0);
    const firstDeliveryId = group[0].id;

    return `
      <div class="kanban-card" draggable="true" data-delivery-id="${firstDeliveryId}" data-group-date="${dateKey}" ondragstart="handleSewingDragStart(event)" style="border-left:3px solid var(--orange)">
        <div class="kanban-card-title" style="margin-bottom:6px">
          <span style="font-size:13px;font-weight:700;color:var(--orange)">📦 Giao hàng ${formatDate(dateKey)}</span>
          <span style="font-size:11px;color:var(--text-muted);background:rgba(245,158,11,0.15);padding:2px 8px;border-radius:10px;font-weight:600">${grandTotal} sp</span>
        </div>
        <div style="overflow-x:auto;margin-bottom:8px;">
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
              <th style="padding:4px 8px;font-size:11px;color:var(--text-muted);font-weight:600;text-align:left;">Sản phẩm</th>
              ${headerCells}
            </tr></thead>
            <tbody>${bodyRows}
              <tr><td style="padding:4px 8px;font-size:11px;font-weight:700;color:var(--text-muted)">TỔNG</td>${totalRow}</tr>
            </tbody>
          </table>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;align-items:center;">
          <button class="btn-icon btn-edit-group-delivery" data-group-date="${dateKey}" title="Sửa tất cả" style="padding:3px 8px;font-size:11px;color:var(--orange);background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:4px;cursor:pointer;display:flex;align-items:center;gap:3px;">✏️ Sửa</button>
          ${group.map(d => `<button class="btn-icon btn-delete-delivery" data-delivery-id="${d.id}" title="Xóa ${rows.find(r=>r.deliveryId===d.id)?.productName||''}" style="padding:2px 4px;font-size:11px;color:var(--red)">🗑️</button>`).join('')}
        </div>
      </div>`;
  }).join('');
}

// === BATCH DELIVERY MODAL ===
function showBatchDeliveryModal() {
  const activeSewings = store.getSewings().filter(s => s.status !== 'Done');
  if (activeSewings.length === 0) { showToast('Không có lô vải nào đang may', 'error'); return; }

  const sewingOptions = activeSewings.map(s => {
    const lot = store.getLot(s.lotId);
    const sizes = store.getSewingSizes(s.id);
    const remaining = sizes.reduce((sum, sz) => sum + Math.max(0, sz.quantitySent - sz.quantityReturned), 0);
    const label = lot ? `${lot.fabricName || ''}${lot.color ? ' ' + lot.color : ''} - ${lot.customerName || ''} (còn ${remaining})` : s.id;
    return { id: s.id, label, remaining };
  }).filter(o => o.remaining > 0);

  if (sewingOptions.length === 0) { showToast('Tất cả lô vải đã giao xong', 'info'); return; }

  const today = new Date().toISOString().split('T')[0];
  const datalistOptionsHTML = sewingOptions.map(o => `<option value="${o.id}" label="${o.label}">${o.label}</option>`).join('');

  openModal('📋 Nhập Hàng May Xong', `
    <div style="margin-bottom:16px;">
      <label style="font-size:13px;color:var(--text-secondary);font-weight:600;display:block;margin-bottom:6px;">Ngày giao hàng *</label>
      <input type="date" id="batch-delivery-date" value="${today}" required style="width:200px;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:var(--bg-secondary);color:var(--text-primary);font-size:13px;" />
    </div>
    <p style="margin-bottom:12px;color:var(--text-secondary);font-size:13px">Chọn sản phẩm và nhập số lượng theo từng size:</p>
    <div style="overflow-x:auto;max-height:400px;overflow-y:auto;">
      <table style="width:100%;border-collapse:collapse;" id="batch-delivery-table">
        <thead><tr style="background:rgba(255,255,255,0.03);position:sticky;top:0;z-index:1;">
          <th style="padding:8px;font-size:12px;color:#b8a07a;font-weight:600;text-align:left;min-width:200px;">Sản phẩm (Lô vải)</th>
          ${ALL_SIZES.map(s => `<th style="padding:8px;font-size:12px;color:#b8a07a;font-weight:600;text-align:center;">${s}</th>`).join('')}
          <th style="padding:8px;width:30px;"></th>
        </tr></thead>
        <tbody id="batch-rows-container">
          <tr class="batch-row" data-row="0">
            <td style="padding:6px;position:relative;">
              <input type="text" list="batch-datalist-0" class="batch-sewing-search" data-row="0" placeholder="🔍 Gõ tìm sản phẩm..." autocomplete="off" style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid rgba(245,158,11,0.25);background:rgba(30,30,50,0.9);color:#e8d5b0;font-size:12px;" />
              <datalist id="batch-datalist-0">${datalistOptionsHTML}</datalist>
              <input type="hidden" class="batch-sewing-select" data-row="0" value="" />
            </td>
            ${ALL_SIZES.map(size => `<td style="padding:4px;text-align:center;"><input type="number" min="0" max="0" value="0" class="batch-size-input" data-row="0" data-size="${size}" disabled style="width:48px;text-align:center;padding:4px;border-radius:4px;border:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02);color:#8a8a8a;font-size:12px;opacity:0.3"/></td>`).join('')}
            <td style="padding:4px;text-align:center;"><button class="batch-remove-row" data-row="0" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;padding:4px;">✕</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <button id="btn-add-batch-row" style="margin-top:10px;background:none;border:1px dashed rgba(255,255,255,0.2);color:var(--blue);cursor:pointer;padding:8px 16px;border-radius:6px;font-size:12px;width:100%;transition:all .2s;">+ Thêm dòng sản phẩm</button>
  `,
  `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Hủy</button>
   <button class="btn btn-primary" id="btn-confirm-batch" style="background:linear-gradient(135deg,#f59e0b,#ef4444);border:none;">📦 Tạo Thẻ Giao Hàng</button>`);

  let rowCount = 1;

  const updateSizeInputs = (row, sewingId) => {
    const sewSizes = sewingId ? store.getSewingSizes(sewingId) : [];
    ALL_SIZES.forEach(size => {
      const input = document.querySelector(`.batch-size-input[data-row="${row}"][data-size="${size}"]`);
      if (!input) return;
      const ss = sewSizes.find(sz => sz.size === size);
      const max = ss ? Math.max(0, ss.quantitySent - ss.quantityReturned) : 0;
      input.max = max; input.value = 0; input.disabled = max === 0;
      input.style.opacity = max === 0 ? '0.3' : '1';
      input.style.background = max === 0 ? 'rgba(255,255,255,0.02)' : 'var(--bg-primary)';
      let maxLabel = input.parentElement.querySelector('.max-label');
      if (max > 0) {
        if (!maxLabel) { maxLabel = document.createElement('div'); maxLabel.className = 'max-label'; maxLabel.style.cssText = 'font-size:9px;color:var(--text-muted);margin-top:2px;'; input.parentElement.appendChild(maxLabel); }
        maxLabel.textContent = `max ${max}`;
      } else if (maxLabel) { maxLabel.remove(); }
    });
  };

  const modalBody = document.getElementById('modal-body');
  // Handle searchable input -> resolve to sewingId
  modalBody.addEventListener('input', (e) => {
    if (e.target.classList.contains('batch-sewing-search')) {
      const row = e.target.dataset.row;
      const val = e.target.value.trim();
      const match = sewingOptions.find(o => o.id === val || o.label === val);
      const hiddenInput = document.querySelector(`.batch-sewing-select[data-row="${row}"]`);
      if (match) {
        hiddenInput.value = match.id;
        e.target.style.borderColor = 'rgba(34,197,94,0.5)';
        e.target.style.color = '#a8d8a0';
        updateSizeInputs(row, match.id);
      } else {
        hiddenInput.value = '';
        e.target.style.borderColor = 'rgba(245,158,11,0.25)';
        e.target.style.color = '#e8d5b0';
        updateSizeInputs(row, '');
      }
    }
  });
  modalBody.addEventListener('click', (e) => {
    if (e.target.classList.contains('batch-remove-row')) {
      const row = e.target.closest('.batch-row');
      if (row && document.querySelectorAll('.batch-row').length > 1) row.remove();
    }
  });

  document.getElementById('btn-add-batch-row').addEventListener('click', () => {
    const container = document.getElementById('batch-rows-container');
    const tr = document.createElement('tr');
    tr.className = 'batch-row'; tr.dataset.row = rowCount;
    tr.innerHTML = `
      <td style="padding:6px;position:relative;">
        <input type="text" list="batch-datalist-${rowCount}" class="batch-sewing-search" data-row="${rowCount}" placeholder="🔍 Gõ tìm sản phẩm..." autocomplete="off" style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid rgba(245,158,11,0.25);background:rgba(30,30,50,0.9);color:#e8d5b0;font-size:12px;" />
        <datalist id="batch-datalist-${rowCount}">${datalistOptionsHTML}</datalist>
        <input type="hidden" class="batch-sewing-select" data-row="${rowCount}" value="" />
      </td>
      ${ALL_SIZES.map(size => `<td style="padding:4px;text-align:center;"><input type="number" min="0" max="0" value="0" class="batch-size-input" data-row="${rowCount}" data-size="${size}" disabled style="width:48px;text-align:center;padding:4px;border-radius:4px;border:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02);color:#8a8a8a;font-size:12px;opacity:0.3"/></td>`).join('')}
      <td style="padding:4px;text-align:center;"><button class="batch-remove-row" data-row="${rowCount}" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;padding:4px;">✕</button></td>`;
    container.appendChild(tr);
    rowCount++;
  });

  document.getElementById('btn-confirm-batch').addEventListener('click', () => {
    const deliveryDate = document.getElementById('batch-delivery-date').value;
    if (!deliveryDate) { showToast('Vui lòng chọn ngày giao hàng', 'error'); return; }

    const rows = document.querySelectorAll('.batch-row');
    let hasAny = false;
    let errors = [];

    rows.forEach(row => {
      const sewingId = row.querySelector('.batch-sewing-select')?.value;
      if (!sewingId) return;
      const deliverySizes = [];
      const sewingSizes = store.getSewingSizes(sewingId);

      ALL_SIZES.forEach(size => {
        const qty = parseInt(row.querySelector(`.batch-size-input[data-size="${size}"]`)?.value) || 0;
        if (qty > 0) {
          const ss = sewingSizes.find(s => s.size === size);
          const max = ss ? Math.max(0, ss.quantitySent - ss.quantityReturned) : 0;
          if (qty > max) { const lot = store.getLot(store.getSewing(sewingId)?.lotId); errors.push(`${lot?.fabricName || sewingId} size ${size}: max ${max}, nhập ${qty}`); }
          deliverySizes.push({ size, quantity: qty });
        }
      });

      if (deliverySizes.length > 0 && errors.length === 0) {
        const updatedSewingSizes = sewingSizes.map(s => {
          const del = deliverySizes.find(d => d.size === s.size);
          return del ? { ...s, quantityReturned: s.quantityReturned + del.quantity } : s;
        });
        store.setSewingSizes(sewingId, updatedSewingSizes);
        const allReturned = updatedSewingSizes.every(s => s.quantityReturned >= s.quantitySent);
        store.updateSewing(sewingId, { status: allReturned ? 'Done' : 'Partial Return' });

        const delivery = store.addDelivery({ sewingId, deliveryDate });
        store.setDeliverySizes(delivery.id, deliverySizes);

        const totalDelivered = deliverySizes.reduce((s, x) => s + x.quantity, 0);
        const sewing = store.getSewing(sewingId);
        if (sewing && totalDelivered > 0) store.consumeMaterialsForLot(sewing.lotId, totalDelivered);
        hasAny = true;
      }
    });

    if (errors.length > 0) { showToast(`Lỗi: ${errors[0]}`, 'error'); return; }
    if (!hasAny) { showToast('Vui lòng chọn sản phẩm và nhập số lượng', 'error'); return; }

    closeModal();
    renderSewingTable();
    showToast('Đã tạo thẻ giao hàng thành công! 🎉');
  });
}
