import { store } from './store.js';
import { showToast, openModal, closeModal, formatNumber } from './ui.js';

export function initMaterialModule() {
  document.getElementById('btn-add-material').addEventListener('click', () => showMaterialModal());
  const searchInput = document.getElementById('material-search');
  if (searchInput) {
    searchInput.addEventListener('input', renderMaterialTable);
  }
  renderMaterialTable();
}

export function renderMaterialTable() {
  const tbody = document.getElementById('material-table-body');
  if (!tbody) return;

  const searchTerm = document.getElementById('material-search')?.value.toLowerCase() || '';
  let materials = store.getMaterials();

  if (searchTerm) {
    materials = materials.filter(m => 
      m.id.toLowerCase().includes(searchTerm) || 
      m.name.toLowerCase().includes(searchTerm)
    );
  }

  if (materials.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">Chưa có phụ liệu nào.</td></tr>`;
    return;
  }

  tbody.innerHTML = materials.map(m => `
    <tr>
      <td><strong>${m.id}</strong></td>
      <td>${m.name}</td>
      <td style="color:${m.stock < 0 ? 'var(--red)' : 'var(--blue)'}; font-weight:bold;">
        ${formatNumber(m.stock)}
      </td>
      <td>${m.unit}</td>
      <td>
        <button class="btn-icon" onclick="showMaterialModal('${m.id}')" title="Sửa/Nhập thêm">✏️</button>
        <button class="btn-icon" onclick="deleteMaterial('${m.id}')" title="Xóa" style="color:var(--red)">🗑️</button>
      </td>
    </tr>
  `).join('');
}

window.showMaterialModal = (editId = null) => {
  const isEdit = !!editId;
  const m = isEdit ? store.getMaterials().find(x => x.id === editId) : null;

  openModal(isEdit ? 'Cập Nhật Kho Phụ Liệu' : 'Thêm Phụ Liệu Mới', `
    <div class="form-grid">
      <div class="form-group full">
        <label>Tên Phụ Liệu * (VD: Vải lót, Nút nhựa...)</label>
        <input type="text" id="mat-name" value="${m ? m.name : ''}" required />
      </div>
      <div class="form-group">
        <label>Đơn Vị * (VD: m, cái, cuộn)</label>
        <input type="text" id="mat-unit" value="${m ? m.unit : ''}" required />
      </div>
      <div class="form-group">
        <label>${isEdit ? 'Nhập thêm tồn kho (sẽ cộng dồn)' : 'Tồn Kho Ban Đầu'}</label>
        <input type="number" id="mat-stock" step="0.1" value="0" />
        ${isEdit ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Tồn kho hiện tại: ${m.stock}</div>` : ''}
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-primary" id="btn-save-mat">${isEdit ? 'Cập Nhật' : 'Lưu'}</button>
  `);

  document.getElementById('btn-save-mat').addEventListener('click', () => {
    const name = document.getElementById('mat-name').value.trim();
    const unit = document.getElementById('mat-unit').value.trim();
    const stockInput = parseFloat(document.getElementById('mat-stock').value) || 0;

    if (!name || !unit) {
      showToast('Vui lòng nhập Tên và Đơn vị', 'error');
      return;
    }

    if (isEdit) {
      store.updateMaterial(editId, {
        name,
        unit,
        stock: (m.stock || 0) + stockInput
      });
      showToast('Đã cập nhật phụ liệu');
    } else {
      store.addMaterial({
        name,
        unit,
        stock: stockInput
      });
      showToast('Đã thêm phụ liệu mới');
    }
    
    closeModal();
    renderMaterialTable();
  });
};

window.deleteMaterial = (id) => {
  if (confirm('Bạn có chắc muốn xóa phụ liệu này không? Các định mức cũ dùng phụ liệu này sẽ mất liên kết tồn kho.')) {
    store.deleteMaterial(id);
    renderMaterialTable();
    showToast('Đã xóa phụ liệu', 'info');
  }
};
