// ===== FIREBASE SYNC MODULE =====
// Đồng bộ dữ liệu giữa localStorage (cache nhanh) và Firestore (cloud)
import { db } from './firebase.js';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

const FIRESTORE_DOC = 'app_data';
const FIRESTORE_COLLECTION = 'xuong_may';

let isSyncingFromCloud = false;
let saveTimeout = null;

/**
 * Lưu dữ liệu lên Firestore (có debounce để tránh ghi quá nhiều)
 */
export function saveToFirestore(data) {
  if (isSyncingFromCloud) return; // Tránh vòng lặp khi nhận data từ cloud

  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      const docRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOC);
      await setDoc(docRef, {
        ...data,
        lastUpdated: new Date().toISOString()
      });
      console.log('✅ Đã đồng bộ lên Firebase');
    } catch (error) {
      console.error('❌ Lỗi đồng bộ Firebase:', error);
    }
  }, 500); // Debounce 500ms
}

/**
 * Lắng nghe thay đổi real-time từ Firestore
 * Khi có thiết bị khác cập nhật, dữ liệu sẽ tự động đồng bộ về
 */
export function subscribeToFirestore(onDataReceived) {
  const docRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOC);

  return onSnapshot(docRef, (snapshot) => {
    if (snapshot.exists()) {
      const cloudData = snapshot.data();
      // Bỏ field lastUpdated khi đưa vào store
      delete cloudData.lastUpdated;

      isSyncingFromCloud = true;
      onDataReceived(cloudData);
      isSyncingFromCloud = false;

      console.log('☁️ Đã nhận dữ liệu từ Firebase');
    }
  }, (error) => {
    console.error('❌ Lỗi lắng nghe Firebase:', error);
  });
}
