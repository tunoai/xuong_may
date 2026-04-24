import { store } from './store.js';
import { showToast, closeModal, openModal } from './ui.js';

export function initTechpack() {
  document.getElementById('btn-add-techpack').addEventListener('click', () => openTechpackModal());
  document.getElementById('techpack-search').addEventListener('input', renderTechpacks);
  renderTechpacks();
}

function renderTechpacks() {
  const searchTerm = document.getElementById('techpack-search').value.toLowerCase();
  const listEl = document.getElementById('techpack-list');
  const techpacks = store.getTechpacks();
  
  if (techpacks.length === 0) {
    listEl.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📐</div>
      <p>Chưa có Mẫu & Định Mức nào.</p>
    </div>`;
    return;
  }

  const filtered = techpacks.filter(t => 
    t.productName.toLowerCase().includes(searchTerm) || 
    t.lotId.toLowerCase().includes(searchTerm)
  );

  listEl.innerHTML = filtered.map(t => {
    const lot = store.getLots().find(l => l.id === t.lotId);
    const mainImage = t.images && t.images.length > 0 ? t.images[0].url : '';
    
    return `
      <div class="techpack-card" data-id="${t.id}">
        <div class="tp-image-container">
          ${mainImage ? `<img src="${mainImage}" alt="${t.productName}" class="tp-thumb" />` : `<div class="tp-no-img">Không có ảnh</div>`}
        </div>
        <div class="tp-content">
          <div class="tp-header">
            <h3 class="tp-title">${t.productName}</h3>
            <span class="tp-lot-badge">${lot ? lot.id : t.lotId}</span>
          </div>
          <p class="tp-desc">${t.description || 'Không có mô tả'}</p>
          
          <div class="tp-stats">
            <span class="tp-stat">🖼️ ${t.images ? t.images.length : 0} Hình</span>
            <span class="tp-stat">🧵 ${t.bom ? t.bom.length : 0} Vật tư</span>
          </div>
          
          <div class="tp-actions">
            <button class="btn-tp-view" onclick="viewTechpack('${t.id}')">👀 Xem</button>
            <button class="btn-tp-edit" onclick="editTechpack('${t.id}')">✏️ Sửa</button>
            <button class="btn-tp-delete" onclick="deleteTechpack('${t.id}')">🗑️ Xóa</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.viewTechpack = (id) => {
  const t = store.getTechpacks().find(tp => tp.id === id);
  if (!t) return;
  const lot = store.getLots().find(l => l.id === t.lotId);

  let imagesHtml = '';
  if (t.images && t.images.length > 0) {
    imagesHtml = t.images.map(img => `
      <div class="tp-view-img-card">
        <img src="${img.url}" />
        ${img.note ? `<div class="tp-img-note">${img.note}</div>` : ''}
      </div>
    `).join('');
  }

  let bomHtml = '';
  if (t.bom && t.bom.length > 0) {
    bomHtml = `
      <table class="size-entry-table" style="margin-top:10px">
        <thead><tr><th>Nguyên phụ liệu</th><th>Số lượng</th><th>Đơn vị</th></tr></thead>
        <tbody>
          ${t.bom.map(b => `<tr><td>${b.item}</td><td style="text-align:right">${b.quantity}</td><td>${b.unit}</td></tr>`).join('')}
        </tbody>
      </table>
    `;
  }

  openModal(`Mẫu: ${t.productName}`, `
    <div class="tp-view-container">
      <div class="tp-view-info">
        <p><strong>Lô Vải:</strong> ${lot ? `${lot.id} - ${lot.fabricName}` : t.lotId}</p>
        <p><strong>Mô tả:</strong> ${t.description || '...'}</p>
      </div>
      
      ${bomHtml ? `
      <div class="tp-view-section">
        <h4>📦 Định Mức Nguyên Phụ Liệu (BOM)</h4>
        ${bomHtml}
      </div>` : ''}

      ${imagesHtml ? `
      <div class="tp-view-section">
        <h4>📸 Hình Ảnh & Chi Tiết May</h4>
        <div class="tp-view-img-grid">
          ${imagesHtml}
        </div>
      </div>` : ''}
    </div>
  `);
};

window.editTechpack = (id) => openTechpackModal(id);

window.deleteTechpack = (id) => {
  if (confirm('Bạn có chắc muốn xóa Mẫu & Định Mức này?')) {
    store.deleteTechpack(id);
    renderTechpacks();
    showToast('Đã xóa Mẫu & Định Mức');
  }
};

let currentImages = [];
let currentBom = [];

function openTechpackModal(editId = null) {
  const isEdit = !!editId;
  const t = isEdit ? store.getTechpacks().find(tp => tp.id === editId) : null;
  
  currentImages = t && t.images ? [...t.images] : [];
  currentBom = t && t.bom ? [...t.bom] : [];

  const lots = store.getLots();
  const lotOpts = lots.map(l => `<option value="${l.id}">${l.id} - ${l.fabricName}</option>`).join('');

  openModal(isEdit ? 'Sửa Mẫu & Định Mức' : 'Thêm Mẫu Mới', `
    <div class="form-grid">
      <div class="form-group full">
        <label>Tên Sản Phẩm * (VD: Áo đầu bếp tay ngắn)</label>
        <input type="text" id="tp-name" value="${t ? t.productName : ''}" placeholder="Nhập tên thành phẩm..." />
      </div>
      <div class="form-group">
        <label>Áp dụng cho Lô Vải *</label>
        <input type="text" id="tp-lot" list="tp-lot-list" value="${t ? t.lotId : ''}" placeholder="Gõ để tìm mã lô vải..." autocomplete="off" />
        <datalist id="tp-lot-list">
          ${lotOpts}
        </datalist>
      </div>
      <div class="form-group full">
        <label>Mô tả / Lưu ý chung</label>
        <textarea id="tp-desc" rows="2" placeholder="Form áo suông, đường may ẩn...">${t ? t.description : ''}</textarea>
      </div>
    </div>

    <!-- BOM Section -->
    <div class="tp-form-section">
      <div class="tp-form-section-header">
        <h4>📦 Định Mức (Vật tư cần dùng cho 1 SP)</h4>
        <button type="button" class="btn-secondary btn-sm" id="btn-add-bom">+ Thêm Vật Tư</button>
      </div>
      <div id="tp-bom-list"></div>
    </div>

    <!-- Images Section -->
    <div class="tp-form-section">
      <div class="tp-form-section-header">
        <h4>📸 Tải ảnh sản phẩm mẫu / ảnh nút / ren / mã dây kéo / đường may hoặc các lưu ý đi kèm</h4>
        <div class="tp-img-upload-wrapper">
          <button type="button" class="btn-secondary btn-sm">Thêm Ảnh</button>
          <input type="file" id="tp-img-upload" accept="image/*" multiple />
        </div>
      </div>
      <div id="tp-img-list" class="tp-img-edit-grid"></div>
    </div>

    <div style="margin-top:20px; display:flex; justify-content:flex-end; gap:10px;">
      <button class="btn-secondary" onclick="closeModal()">Hủy</button>
      <button class="btn-primary" id="btn-save-tp">${isEdit ? 'Cập Nhật' : 'Lưu Lại'}</button>
    </div>
  `);

  renderBomEdit();
  renderImagesEdit();

  // Add empty BOM row
  document.getElementById('btn-add-bom').addEventListener('click', () => {
    currentBom.push({ id: Date.now().toString(), item: '', quantity: 1, unit: 'cái' });
    renderBomEdit();
  });

  // Handle Image Upload with Canvas Compression
  document.getElementById('tp-img-upload').addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    
    for (let file of files) {
      if (file.size > 2 * 1024 * 1024) {
        showToast('Ảnh quá lớn, đang tự động nén...', 'info');
      }
      try {
        const base64 = await compressImage(file);
        currentImages.push({ id: Date.now().toString() + Math.random(), url: base64, note: '' });
      } catch (err) {
        showToast('Lỗi khi tải ảnh lên', 'error');
      }
    }
    renderImagesEdit();
    e.target.value = ''; // reset
  });

  document.getElementById('btn-save-tp').addEventListener('click', () => {
    const name = document.getElementById('tp-name').value.trim();
    const lotId = document.getElementById('tp-lot').value;
    const desc = document.getElementById('tp-desc').value.trim();

    if (!name || !lotId) {
      showToast('Vui lòng nhập Tên sản phẩm và chọn Lô vải', 'error');
      return;
    }

    // sync inputs
    document.querySelectorAll('.bom-item-input').forEach(input => {
      const b = currentBom.find(x => x.id === input.dataset.id);
      if (b) {
        b.item = input.value;
        // Extract materialId if it matches pattern "[ID] Name"
        const match = input.value.match(/^\[(.*?)\]/);
        if (match) b.materialId = match[1];
        else b.materialId = null;
      }
    });
    document.querySelectorAll('.bom-qty-input').forEach(input => {
      const b = currentBom.find(x => x.id === input.dataset.id);
      if (b) b.quantity = parseFloat(input.value) || 0;
    });
    document.querySelectorAll('.bom-unit-input').forEach(input => {
      const b = currentBom.find(x => x.id === input.dataset.id);
      if (b) b.unit = input.value;
    });
    document.querySelectorAll('.img-note-input').forEach(input => {
      const img = currentImages.find(x => x.id === input.dataset.id);
      if (img) img.note = input.value;
    });

    const validBom = currentBom.filter(b => b.item.trim() !== '');

    const tpData = {
      productName: name,
      lotId,
      description: desc,
      bom: validBom,
      images: currentImages
    };

    if (isEdit) {
      store.updateTechpack(editId, tpData);
      showToast('Cập nhật thành công');
    } else {
      store.addTechpack(tpData);
      showToast('Đã thêm Mẫu & Định Mức');
    }
    
    closeModal();
    renderTechpacks();
  });
}

function renderBomEdit() {
  const container = document.getElementById('tp-bom-list');
  if (currentBom.length === 0) {
    container.innerHTML = `<p class="tp-empty-text">Chưa có vật tư nào. Bấm Thêm Vật Tư.</p>`;
    return;
  }
  
  const mats = store.getMaterials();
  const matOpts = mats.map(m => `<option value="[${m.id}] ${m.name}"></option>`).join('');

  container.innerHTML = `
    <datalist id="tp-mat-list">${matOpts}</datalist>
    ${currentBom.map(b => `
    <div class="bom-edit-row">
      <input type="text" class="bom-item-input" data-id="${b.id}" list="tp-mat-list" value="${b.item}" placeholder="Chọn/Nhập tên (VD: Vải lót)" style="flex:2" />
      <input type="number" class="bom-qty-input" data-id="${b.id}" value="${b.quantity}" step="0.01" style="flex:1" />
      <input type="text" class="bom-unit-input" data-id="${b.id}" value="${b.unit}" placeholder="Đơn vị (VD: m)" style="flex:1" />
      <button class="btn-icon" style="color:var(--red)" onclick="removeBomItem('${b.id}')">✕</button>
    </div>
    `).join('')}
  `;
}

window.removeBomItem = (id) => {
  currentBom = currentBom.filter(b => b.id !== id);
  renderBomEdit();
};

function renderImagesEdit() {
  const container = document.getElementById('tp-img-list');
  if (currentImages.length === 0) {
    container.innerHTML = `<p class="tp-empty-text">Chưa có ảnh. Bấm Thêm Ảnh.</p>`;
    return;
  }

  container.innerHTML = currentImages.map(img => `
    <div class="tp-img-edit-card">
      <img src="${img.url}" />
      <input type="text" class="img-note-input" data-id="${img.id}" value="${img.note}" placeholder="Ghi chú ảnh..." />
      <button class="btn-remove-img" onclick="removeTechpackImg('${img.id}')">✕</button>
    </div>
  `).join('');
}

window.removeTechpackImg = (id) => {
  currentImages = currentImages.filter(img => img.id !== id);
  renderImagesEdit();
};

// Canvas image compression helper
function compressImage(file, maxWidth = 800) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = event => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Compress to JPEG with 0.6 quality to save database space
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        resolve(dataUrl);
      };
      img.onerror = error => reject(error);
    };
    reader.onerror = error => reject(error);
  });
}
