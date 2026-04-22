// ===== MODULE: XỬ LÝ HÀNG LỖI =====
import { store } from './store.js';
import { showToast, openModal, closeModal, formatNumber, formatDate } from './ui.js';

export function initReworkModule() {
  const container = document.getElementById('rework-kanban-container');

  // Event delegation
  container.addEventListener('click', (e) => {
    // "Đã sửa" button
    const fixBtn = e.target.closest('.btn-rework-fix');
    if (fixBtn) {
      e.stopPropagation();
      showFixModal(fixBtn.dataset.reworkId);
      return;
    }

    // "Duyệt" button (approve fixed rework -> history)
    const approveBtn = e.target.closest('.btn-rework-approve');
    if (approveBtn) {
      e.stopPropagation();
      const reworkId = approveBtn.dataset.reworkId;
      store.updateRework(reworkId, { 
        status: 'Approved',
        approvedDate: new Date().toISOString().split('T')[0]
      });
      renderReworkBoard();
      showToast('Đã duyệt và chuyển vào Lịch Sử Giao Hàng!', 'success');
      return;
    }
  });

  window.handleReworkDragStart = (e) => {
    e.dataTransfer.setData('text/plain', e.target.dataset.reworkId);
    e.target.classList.add('dragging');
  };

  window.handleReworkDragOver = (e) => { e.preventDefault(); };

  window.handleReworkDrop = (e, targetStatus) => {
    e.preventDefault();
    const reworkId = e.dataTransfer.getData('text/plain');
    document.querySelector(`[data-rework-id="${reworkId}"]`)?.classList.remove('dragging');
    
    if (!reworkId) return;
    const rework = store.getRework(reworkId);
    if (!rework) return;

    if (rework.status !== targetStatus) {
      store.updateRework(reworkId, { status: targetStatus });
      renderReworkBoard();
    }
  };

  document.addEventListener('dragend', (e) => {
    if (e.target.classList) e.target.classList.remove('dragging');
  });

  renderReworkBoard();
}

export function renderReworkBoard() {
  const container = document.getElementById('rework-kanban-container');
  if (!container) return;

  const allReworks = store.getReworks();
  
  const reworksDefect = allReworks.filter(r => r.status === 'Defect');
  const reworksDone = allReworks.filter(r => r.status === 'Done');

  const renderDefectCard = (r) => {
    const lot = store.getLot(r.lotId);
    const lotName = lot ? `${lot.fabricName}${lot.color ? ' ' + lot.color : ''} ${formatNumber(lot.totalFabric)}m` : r.lotId;

    const totalRemaining = r.totalFailed || 0;

    const breakdownDisplay = r.breakdown ? r.breakdown.split(', ').map(b => {
      const [size, qty] = b.split(':');
      return `<span class="size-pill" style="margin-right:4px;background:rgba(239,68,68,0.15);color:var(--red)">${size}: ${qty}</span>`;
    }).join('') : '';

    return `
      <div class="kanban-card" draggable="true" data-rework-id="${r.id}" ondragstart="handleReworkDragStart(event)" style="border-left: 3px solid var(--red)">
        <div class="kanban-card-title">
          <span>Lô: ${lotName}</span>
          <span style="font-size:11px; color:var(--text-muted)">${formatDate(r.dateSentBack)}</span>
        </div>
        <div style="font-size:12px; color:var(--text-primary); margin-bottom: 8px;">
          <strong>Khách:</strong> ${lot ? lot.customerName : ''} <br/>
          <strong>Lỗi Còn Lại:</strong> <span style="color:var(--red); font-weight:bold">${formatNumber(totalRemaining)}</span>
        </div>
        <div style="background:rgba(255,255,255,0.02); padding:8px; border-radius:4px; margin-bottom:8px">
          <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px">CHI TIẾT LỖI CÒN LẠI:</div>
          <div style="font-size:12px">
            ${breakdownDisplay || '<span style="color:var(--text-muted);font-size:11px">Không còn lỗi</span>'}
          </div>
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-bottom:8px;">
          <em>${r.notes || ''}</em>
        </div>
        <button class="btn btn-xs btn-primary btn-rework-fix" data-rework-id="${r.id}" style="width:100%;background:var(--blue);border-color:var(--blue)">🔧 Đã Sửa</button>
      </div>
    `;
  };

  const renderDoneCard = (r) => {
    const lot = store.getLot(r.lotId);
    const lotName = lot ? `${lot.fabricName}${lot.color ? ' ' + lot.color : ''} ${formatNumber(lot.totalFabric)}m` : r.lotId;

    const fixedDisplay = r.fixedBreakdown ? r.fixedBreakdown.split(', ').map(b => {
      return `<span class="size-pill" style="margin-right:4px;background:rgba(34,197,94,0.15);color:var(--green)">${b}</span>`;
    }).join('') : '';

    return `
      <div class="kanban-card" style="border-left: 3px solid var(--green)">
        <div class="kanban-card-title">
          <span>Lô: ${lotName}</span>
          <span style="font-size:11px; color:var(--text-muted)">${formatDate(r.fixedDate || r.dateSentBack)}</span>
        </div>
        <div style="font-size:12px; color:var(--text-primary); margin-bottom: 8px;">
          <strong>Khách:</strong> ${lot ? lot.customerName : ''} <br/>
          <strong>Đã sửa:</strong> <span style="color:var(--green); font-weight:bold">${formatNumber(r.totalFixed || 0)}</span>
        </div>
        <div style="background:rgba(255,255,255,0.02); padding:8px; border-radius:4px; margin-bottom:8px">
          <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px">SIZE ĐÃ SỬA:</div>
          <div style="font-size:12px">${fixedDisplay}</div>
        </div>
        <button class="btn btn-xs btn-primary btn-rework-approve" data-rework-id="${r.id}" style="width:100%;background:var(--green);border-color:var(--green)">📤 GỬI KHÁCH</button>
      </div>
    `;
  };

  container.innerHTML = `
    <div class="kanban-col" id="col-rework-defect" ondragover="handleReworkDragOver(event)" ondrop="handleReworkDrop(event, 'Defect')">
      <div class="kanban-col-header" style="border-bottom-color:var(--red)">
        HÀNG LỖI <span class="badge" style="background:var(--red)">${reworksDefect.length}</span>
      </div>
      <div class="kanban-cards">
        ${reworksDefect.map(r => renderDefectCard(r)).join('')}
        ${reworksDefect.length === 0 ? '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px;">Không có hàng lỗi</div>' : ''}
      </div>
    </div>
    
    <div class="kanban-col" id="col-rework-done" ondragover="handleReworkDragOver(event)" ondrop="handleReworkDrop(event, 'Done')">
      <div class="kanban-col-header" style="border-bottom-color:var(--green)">
        ĐÃ XỬ LÝ (TRẠNG THÁI SỬA) <span class="badge" style="background:var(--green)">${reworksDone.length}</span>
      </div>
      <div style="font-size:11px; font-style:italic; color:var(--text-muted); padding: 8px 12px;">Kéo hàng lỗi sang đây khi xử lý xong, hoặc bấm "Đã Sửa" để nhập chi tiết</div>
      <div class="kanban-cards">
        ${reworksDone.map(r => renderDoneCard(r)).join('')}
        ${reworksDone.length === 0 ? '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px;">Chưa có hàng lỗi nào được xử lý</div>' : ''}
      </div>
    </div>
  `;
}

function parseBreakdown(str) {
  const map = {};
  if (!str) return map;
  str.split(', ').forEach(item => {
    const [size, qty] = item.split(':');
    map[size.trim()] = parseInt(qty) || 0;
  });
  return map;
}

function showFixModal(reworkId) {
  const rework = store.getRework(reworkId);
  if (!rework) return;
  
  const lot = store.getLot(rework.lotId);
  const lotName = lot ? `${lot.fabricName}${lot.color ? ' ' + lot.color : ''} ${formatNumber(lot.totalFabric)}m` : rework.lotId;
  
  const originalBreakdown = parseBreakdown(rework.breakdown);

  const sizeRows = Object.entries(originalBreakdown).map(([size, totalQty]) => {
    return `<tr>
      <td><strong>${size}</strong></td>
      <td style="color:var(--red);font-weight:bold">${totalQty}</td>
      <td><input type="number" min="0" max="${totalQty}" value="0" data-size="${size}" class="fix-qty-input" style="width:70px" /></td>
    </tr>`;
  }).join('');

  openModal(`🔧 Cập Nhật Sửa Lỗi - ${lotName}`, `
    <p style="margin-bottom:12px;color:var(--text-secondary);font-size:13px">Nhập số lượng đã sửa xong cho từng size:</p>
    <table class="size-entry-table" style="margin-top:12px">
      <thead><tr>
        <th>Size</th>
        <th>Lỗi Còn Lại</th>
        <th>Sửa Xong</th>
      </tr></thead>
      <tbody>${sizeRows}</tbody>
    </table>`,
    `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Hủy</button>
     <button class="btn btn-primary" id="btn-confirm-fix">Xác Nhận Đã Sửa</button>`);

  document.getElementById('btn-confirm-fix').addEventListener('click', () => {
    const inputs = document.querySelectorAll('.fix-qty-input');
    const incrementFixed = {};
    let incrementTotal = 0;
    let anyChange = false;

    inputs.forEach(input => {
      const size = input.dataset.size;
      const addQty = parseInt(input.value) || 0;
      if (addQty > 0) {
        incrementFixed[size] = addQty;
        incrementTotal += addQty;
        anyChange = true;
      }
    });

    if (!anyChange) {
      showToast('Vui lòng nhập số lượng đã sửa', 'error');
      return;
    }

    const incrementBreakdownStr = Object.entries(incrementFixed).map(([size, qty]) => `${size}:${qty}`).join(', ');

    // 1. Create a NEW card in "ĐÃ XỬ LÝ" for the fixed items
    store.addRework({
      qcId: rework.qcId,
      sewingId: rework.sewingId,
      deliveryId: rework.deliveryId,
      lotId: rework.lotId,
      totalFixed: incrementTotal,
      fixedBreakdown: incrementBreakdownStr,
      dateSentBack: rework.dateSentBack,
      fixedDate: new Date().toISOString().split('T')[0],
      status: 'Done',
      notes: 'Hàng đã sửa (Tách từ lô lỗi)'
    });

    // 2. Subtract fixed items from the original card
    const newBreakdown = {};
    Object.keys(originalBreakdown).forEach(size => {
      const remaining = originalBreakdown[size] - (incrementFixed[size] || 0);
      if (remaining > 0) {
        newBreakdown[size] = remaining;
      }
    });
    
    const newBreakdownStr = Object.entries(newBreakdown).map(([size, qty]) => `${size}:${qty}`).join(', ');
    const newTotalFailed = (rework.totalFailed || 0) - incrementTotal;

    if (newTotalFailed <= 0) {
      // Original card is fully fixed, hide it by setting status to 'Resolved'
      store.updateRework(reworkId, { 
        breakdown: '',
        totalFailed: 0,
        status: 'Resolved'
      });
      showToast('Đã sửa hết hàng lỗi! Thẻ đã chuyển sang cột ĐÃ XỬ LÝ', 'success');
    } else {
      // Still some defects remaining
      store.updateRework(reworkId, { 
        breakdown: newBreakdownStr,
        totalFailed: newTotalFailed
      });
      showToast(`Đã ghi nhận ${incrementTotal} sản phẩm sửa xong! Một thẻ mới đã được tạo ở cột ĐÃ XỬ LÝ`, 'info');
    }

    closeModal();
    renderReworkBoard();
  });
}
