/**
 * 遠端儲存的啟動程序：開畫面之前先把伺服器上的資料讀回來。
 *
 * 獨立成一個檔案而不是放進 index.ts，是為了避免循環相依——
 * data.ts 會 import index.ts（取得 isRemoteStorage／scheduleRemoteSave），
 * 若 index.ts 反過來 import data.ts，兩邊的模組初始化順序就會互相卡住。
 * 這個檔案只有 main.tsx 會載入，站在相依鏈的最外圈。
 */
import { applySessionSnapshot, buildSessionSnapshot, type SessionSnapshot } from '@/mocks/data'
import {
  exportPermissionState,
  importPermissionState,
  onPermissionSettingsPersisted,
  type PermissionState,
} from '@/lib/permissions'
import { resetDocumentEventBaseline } from '@/mocks/document-events'
import {
  installFlushOnLeave,
  isRemoteStorage,
  loadRemoteSnapshot,
  registerRemoteApply,
  registerSnapshotSource,
  scheduleRemoteSave,
  startRemotePolling,
} from './index'

/**
 * 伺服器上存的那包東西：單據與主檔，外加權限設定。
 * 權限設定一併納入，否則管理員調完角色權限，別人重新整理就被打回預設——
 * 在共用環境裡那等於設定沒有生效。
 */
interface RemotePayload {
  data: SessionSnapshot
  permissions?: PermissionState
}

const remoteApplied: (() => void)[] = []

/**
 * 訂閱「伺服器上的資料已換成新的一份」。
 * 畫面層藉此重新整理查詢——資料陣列被抽換掉了，React Query 手上那份快取已是舊的。
 */
export function onRemoteSnapshotApplied(fn: () => void): () => void {
  remoteApplied.push(fn)
  return () => {
    const i = remoteApplied.indexOf(fn)
    if (i >= 0) remoteApplied.splice(i, 1)
  }
}

/**
 * 回傳是否為遠端模式。載入失敗時**不阻擋開站**，改以種子資料起步並回報錯誤——
 * 展示環境掛掉時，讓客戶看到一個能動的畫面，比卡在白畫面好。
 */
export async function initPrototypeStorage(): Promise<void> {
  if (!isRemoteStorage()) return

  try {
    const payload = (await loadRemoteSnapshot()) as RemotePayload | undefined
    if (payload?.data) applySessionSnapshot(payload.data)
    if (payload?.permissions) importPermissionState(payload.permissions)
  } catch (error) {
    console.error('[prototype-storage] 讀取伺服器資料失敗，改以預設展示資料起步', error)
  }

  registerSnapshotSource((): RemotePayload => ({
    data: buildSessionSnapshot(),
    permissions: exportPermissionState(),
  }))
  // 權限設定不走 mutation 那條路，故另外掛一次存檔通知
  onPermissionSettingsPersisted(scheduleRemoteSave)
  installFlushOnLeave()

  registerRemoteApply((raw) => {
    const payload = raw as RemotePayload
    if (payload?.data) applySessionSnapshot(payload.data)
    if (payload?.permissions) importPermissionState(payload.permissions)
    // 重建基準：對方改的東西已經是我們的現況，不可在自己下一次存檔時被當成自己改的再報一次
    resetDocumentEventBaseline()
    remoteApplied.forEach((fn) => fn())
  })
  startRemotePolling()
}
