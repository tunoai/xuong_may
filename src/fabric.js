// ===== MODULE 1: FABRIC & CUTTING KANBAN =====
import { store } from './store.js';
import { showToast, openModal, closeModal, statusBadge, priorityBadge, formatDate, formatNumber, SIZES, lotLabel } from './ui.js';
import { showExportCuttingModal } from './cutting.js';

export function initFabricModule() {
  document.getElementById('btn-add-lot').addEventListener('click', showAddLotModal);
  
  const container = document.getElementById('fabric-kanban-container');
  
  // Event delegation for card actions
  container.addEventListener('click', (e) => {
    // Edit button
    const editBtn = e.target.closest('.btn-edit-kanban');
    if (editBtn) {
      e.stopPropagation();
      showEditLotModal(editBtn.dataset.lotId);
      return;
    }

    // Priority toggle
    const prioBtn = e.target.closest('.btn-prio-toggle');
    if (prioBtn) {
      e.stopPropagation();
      const lotId = prioBtn.dataset.lotId;
      const size = prioBtn.dataset.size;
      const current = store.getPrioritySizes(lotId);
      if (current.includes(size)) {
        store.setPrioritySizes(lotId, current.filter(s => s !== size));
        showToast(`Đã bỏ theo dõi size ${size}`, 'info');
      } else {
        store.setPrioritySizes(lotId, [...current, size]);
        showToast(`⭐ Đang theo dõi size ${size}`, 'success');
      }
      renderKanbanBoard();
      return;
    }

    // Delete button
    const deleteBtn = e.target.closest('.btn-delete-kanban');
    if (deleteBtn) {
      e.stopPropagation();
      const lotId = deleteBtn.dataset.lotId;
      if (confirm(`Bạn có chắc muốn xóa lô vải ${lotId} này không?`)) {
        store.deleteLot(lotId);
        renderKanbanBoard();
        showToast('Đã xóa lô vải', 'info');
      }
      return;
    }

    // Transfer button
    const transferBtn = e.target.closest('.btn-transfer-kanban');
    if (transferBtn) {
      e.stopPropagation();
      showExportCuttingModal(transferBtn.dataset.cutting);
      return;
    }
  });

  document.addEventListener('dragend', (e) => {
    if (e.target.classList) e.target.classList.remove('dragging');
  });

  renderKanbanBoard();
}

// Ensure SIZES is available (if not exported from ui.js properly, define it here)
const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL'];

export function renderKanbanBoard() {
  const container = document.getElementById('fabric-kanban-container');
  const allLots = store.getLots();
  const allCuttings = store.getCuttings();

  // Column 1: LÔ VẢI MỚI (Lots that are New and don't have an active cutting)
  const newLots = allLots.filter(l => {
    if (l.status === 'Done' || l.status === 'Sewing' || l.status === 'QC') return false;
    const cutting = allCuttings.find(c => c.lotId === l.id && !c.isExported);
    return !cutting;
  });

  // Column 2: ĐANG CẮT (Lots that have an active cutting)
  const cuttingLots = allLots.filter(l => {
    const cutting = allCuttings.find(c => c.lotId === l.id && !c.isExported);
    return !!cutting;
  });

  const renderCard = (lot, isCutting) => {
    const prioColor = lot.priority === 'Very Urgent' ? 'var(--red)' : lot.priority === 'Urgent' ? 'var(--yellow)' : 'var(--text-secondary)';
    
    let cuttingHtml = '';
    let cuttingId = null;
    
    if (isCutting) {
      const cutting = allCuttings.find(c => c.lotId === lot.id && !c.isExported);
      cuttingId = cutting.id;
      const existingSizes = store.getCuttingSizes(cuttingId);
      const prioSizes = store.getPrioritySizes(lot.id);
      
      const sizeInputs = ALL_SIZES.map(sz => {
        const existing = existingSizes.find(s => s.size === sz);
        const qty = existing ? existing.quantity : '';
        const isPrio = prioSizes.includes(sz);
        return `<div class="kanban-size-item ${isPrio ? 'priority-size' : ''}">
          <div style="display:flex;align-items:center;gap:2px;justify-content:center">
            <span class="kanban-size-label">${sz}</span>
            <button class="btn-prio-toggle" data-lot-id="${lot.id}" data-size="${sz}" title="Đánh dấu ưu tiên" style="cursor:pointer;background:none;border:none;font-size:12px;padding:0;line-height:1;color:${isPrio ? '#f59e0b' : 'var(--text-muted)'}">${isPrio ? '⭐' : '☆'}</button>
          </div>
          <input type="number" min="0" class="kanban-size-input cutting-quick-size" data-cutting="${cuttingId}" data-size="${sz}" value="${qty}" style="${isPrio ? 'border-color:#f59e0b;box-shadow:0 0 6px rgba(245,158,11,0.3)' : ''}">
        </div>`;
      }).join('');

      cuttingHtml = `
        <div style="margin-top: 10px; border-top: 1px solid var(--border); padding-top: 10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:11px; color:var(--text-muted)">NHẬP SỐ CẮT:</span>
            ${prioSizes.length > 0 ? '<span style="font-size:10px;color:#f59e0b">⭐ Size ưu tiên đang theo dõi</span>' : ''}
          </div>
          <div class="kanban-sizes-grid">${sizeInputs}</div>
          <button class="btn btn-xs btn-primary btn-transfer-kanban" data-cutting="${cuttingId}" style="width:100%">📤 Xuất qua May</button>
        </div>
      `;
    }

    const hasPrio = isCutting && store.getPrioritySizes(lot.id).length > 0;

    return `
      <div class="kanban-card${hasPrio ? ' priority-card' : ''}" draggable="true" data-lot-id="${lot.id}" ondragstart="handleDragStart(event)">
        <div class="kanban-card-title">
          <span>${lot.id}</span>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:12px; color:${prioColor}">${lot.priority === 'Normal' ? '' : '⭐ ' + lot.priority}</span>
            <button class="btn-icon btn-edit-kanban" data-lot-id="${lot.id}" title="Sửa Lô Vải" style="padding:0; font-size:12px; color:var(--text-muted);">✏️</button>
            <button class="btn-icon btn-delete-kanban" data-lot-id="${lot.id}" title="Xóa Lô Vải" style="padding:0; font-size:12px; color:var(--red);">🗑️</button>
          </div>
        </div>
        <div class="kanban-card-meta">
          <span>${lot.customerName}</span>
          <span>${formatDate(lot.dateReceived)}</span>
        </div>
        <div style="font-size:13px; color:var(--text-primary);">
          <strong>${lot.fabricName}</strong> ${lot.color ? ` - ${lot.color}` : ''}
        </div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">
          Tổng mét: <strong style="color:var(--blue)">${formatNumber(lot.totalFabric)} m</strong>
        </div>
        ${cuttingHtml}
      </div>
    `;
  };

  container.innerHTML = `
    <div class="kanban-col" id="col-new" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'new')">
      <div class="kanban-col-header">
        LÔ VẢI MỚI <span class="badge badge-new">${newLots.length}</span>
      </div>
      <div class="kanban-cards">
        ${newLots.map(l => renderCard(l, false)).join('')}
        ${newLots.length === 0 ? '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px;">Không có lô mới</div>' : ''}
      </div>
    </div>
    
    <div class="kanban-col" id="col-cutting" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'cutting')">
      <div class="kanban-col-header" style="border-bottom-color:var(--orange)">
        ĐANG CẮT <span class="badge badge-cutting">${cuttingLots.length}</span>
      </div>
      <div class="kanban-cards">
        ${cuttingLots.map(l => renderCard(l, true)).join('')}
        ${cuttingLots.length === 0 ? '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px;">Kéo lô vải vào đây để bắt đầu cắt</div>' : ''}
      </div>
    </div>
  `;

  // Attach auto-save for inputs
  document.querySelectorAll('.cutting-quick-size').forEach(input => {
    input.addEventListener('change', (e) => {
      const cuttingId = e.target.dataset.cutting;
      // Gather all sizes for this cutting
      const sizes = [];
      document.querySelectorAll(`.cutting-quick-size[data-cutting="${cuttingId}"]`).forEach(inp => {
        const qty = parseInt(inp.value) || 0;
        if (qty > 0) sizes.push({ size: inp.dataset.size, quantity: qty });
      });
      store.setCuttingSizes(cuttingId, sizes);
      showToast('Đã lưu số lượng cắt');
    });
  });

  // Make drag handlers global so inline events work
  window.handleDragStart = (e) => {
    e.dataTransfer.setData('text/plain', e.target.dataset.lotId);
    e.target.classList.add('dragging');
  };

  window.handleDragOver = (e) => {
    e.preventDefault(); // Necessary to allow dropping
  };

  window.handleDrop = (e, targetCol) => {
    e.preventDefault();
    const lotId = e.dataTransfer.getData('text/plain');
    document.querySelector(`[data-lot-id="${lotId}"]`)?.classList.remove('dragging');
    
    const lot = store.getLot(lotId);
    if (!lot) return;

    if (targetCol === 'cutting') {
      // Move to cutting: Create a cutting record if not exists
      const existingCutting = store.getCuttings().find(c => c.lotId === lotId && !c.isExported);
      if (!existingCutting) {
        store.addCutting({
          lotId: lotId,
          dateSent: new Date().toISOString().split('T')[0],
          fabricSent: lot.totalFabric, // Default to all fabric
          dateReturned: '',
          notes: ''
        });
        store.updateLot(lotId, { status: 'Cutting' });
      }
    } else if (targetCol === 'new') {
      // Move to new: Delete active cutting records for this lot
      const existingCutting = store.getCuttings().find(c => c.lotId === lotId && !c.isExported);
      if (existingCutting) {
        if (confirm('Lô này đang cắt. Bạn có chắc muốn chuyển về Kho và xóa dữ liệu đang cắt?')) {
          store.deleteCutting(existingCutting.id);
          store.updateLot(lotId, { status: 'New' });
        } else {
          return;
        }
      }
    }
    renderKanbanBoard();
  };
}

function lotFormHTML(lot = {}) {
  return `<div class="form-grid">
    <div class="form-group"><label>Khách Hàng *</label><input type="text" id="lot-customer" value="${lot.customerName || ''}" required /></div>
    <div class="form-group"><label>Tên Vải *</label><input type="text" id="lot-fabric" value="${lot.fabricName || ''}" required /></div>
    <div class="form-group"><label>Màu *</label><input type="text" id="lot-color" value="${lot.color || ''}" required /></div>
    <div class="form-group"><label>Tổng Mét Vải *</label><input type="number" id="lot-total" min="0" step="0.1" value="${lot.totalFabric || ''}" required /></div>
    <div class="form-group"><label>Ngày Nhận *</label><input type="date" id="lot-date" value="${lot.dateReceived || new Date().toISOString().split('T')[0]}" required /></div>
    <div class="form-group"><label>Ưu Tiên</label>
      <select id="lot-priority">
        <option value="Normal" ${lot.priority === 'Normal' ? 'selected' : ''}>Normal</option>
        <option value="Urgent" ${lot.priority === 'Urgent' ? 'selected' : ''}>Urgent</option>
        <option value="Very Urgent" ${lot.priority === 'Very Urgent' ? 'selected' : ''}>Very Urgent</option>
      </select>
    </div>
  </div>`;
}

function getLotFormData() {
  return {
    customerName: document.getElementById('lot-customer').value.trim(),
    fabricName: document.getElementById('lot-fabric').value.trim(),
    color: document.getElementById('lot-color').value.trim(),
    totalFabric: parseFloat(document.getElementById('lot-total').value) || 0,
    dateReceived: document.getElementById('lot-date').value,
    priority: document.getElementById('lot-priority').value
  };
}

function showAddLotModal() {
  openModal('Tạo Lô Vải Mới', lotFormHTML(),
    `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Hủy</button>
     <button class="btn btn-primary" id="btn-save-lot">Lưu</button>`);

  document.getElementById('btn-save-lot').addEventListener('click', () => {
    const data = getLotFormData();
    if (!data.customerName || !data.fabricName || !data.color || !data.totalFabric) {
      showToast('Vui lòng điền đầy đủ thông tin', 'error'); return;
    }
    store.addLot(data);
    closeModal();
    renderKanbanBoard();
    showToast('Đã thêm lô vải mới!');
  });
}

function showEditLotModal(lotId) {
  const lot = store.getLot(lotId);
  if (!lot) return;

  openModal(`Sửa Lô Vải: ${lotId}`, lotFormHTML(lot),
    `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Hủy</button>
     <button class="btn btn-primary" id="btn-update-lot">Cập Nhật</button>`);

  document.getElementById('btn-update-lot').addEventListener('click', () => {
    const data = getLotFormData();
    store.updateLot(lotId, data);
    closeModal();
    renderKanbanBoard();
    showToast('Đã cập nhật lô vải!');
  });
}

// We only need renderFabricTable exported because main.js still calls it on module switch
export function renderFabricTable() {
  renderKanbanBoard();
}
