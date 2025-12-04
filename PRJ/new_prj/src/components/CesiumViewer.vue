<template>
  <div class="viewer-wrapper">
    <!-- 左上角：GeoJSON 图层勾选面板 -->
    <div class="geojson-select-panel">
      <div class="geojson-select-header">
        <div class="select-title">GeoJSON 图层</div>
        <div class="select-subtitle">勾选要显示的图层</div>
      </div>

      <div class="geojson-checkbox-list">
        <label
          v-for="layer in geojsonLayers"
          :key="layer.name"
          class="checkbox-item"
        >
          <input
            type="checkbox"
            :value="layer.name"
            v-model="selectedLayerNames"
          />
          <span class="checkbox-label">{{ layer.name }}</span>
        </label>
      </div>
    </div>

    <!-- 左侧信息面板 -->
    <div v-if="selectedInfo" class="info-panel">
      <div class="info-header">
        <h3>{{ selectedInfo.name || '区域属性' }}</h3>
        <button @click="handleClearSelection">×</button>
      </div>
      <div class="info-content">
        <div
          v-for="(value, key) in selectedInfo.properties"
          :key="key"
          class="info-row"
        >
          <span class="key">{{ key }}</span>
          <span class="value">{{ value }}</span>
        </div>
      </div>
    </div>

    <!-- 右侧 Cesium 容器 -->
    <div ref="viewerContainer" class="viewer-container"></div>

    <!-- 左下角：清洗按钮 -->
    <button class="clean-toggle-button" @click="handleToggleClean">
      清洗（再次点击恢复）
    </button>

  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as Cesium from 'cesium'
import { createCesiumViewer, destroyCesiumViewer } from '../utils/cesiumBase'
import { loadGeoJson } from '../utils/geojsonLoader'
import { createSelectionHandler, type SelectionInfo } from '../utils/selectionHandler'
import { requestCleanFromPython } from '../utils/cleanApi'

export interface PolygonHideRecord {
  entity: Cesium.Entity
  show: boolean
}

/**
 * 自动扫描 src/assets/geojson 目录下所有 .geojson 文件
 * Vite 会在打包时把它们编译为静态资源 URL
 */
const geojsonModules = import.meta.glob('../assets/geojson/*.geojson', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

interface GeoJsonLayer {
  name: string
  url: string
  dataSource?: Cesium.GeoJsonDataSource
}

const viewerContainer = ref<HTMLElement | null>(null)
const viewer = ref<Cesium.Viewer | null>(null)

const geojsonLayers = ref<GeoJsonLayer[]>([])
const selectedLayerNames = ref<string[]>([])

const selectedInfo = ref<SelectionInfo | null>(null)
let selectionHandler: ReturnType<typeof createSelectionHandler> | null = null

const isCleaned = ref(false) // 当前是否处于“清洗后”状态
let polygonHideRecords: PolygonHideRecord[] = [] // 用于恢复的记录

// 初始化 GeoJSON 图层（根据文件自动生成）
function initGeoJsonLayers() {
  const layers: GeoJsonLayer[] = Object.entries(geojsonModules).map(([path, url]) => {
    const fileName = path.split('/').pop() || 'unnamed.geojson'
    const name = fileName.replace(/\.geojson$/i, '')
    return {
      name,
      url,
    }
  })

  geojsonLayers.value = layers
  // 默认全部选中显示
  selectedLayerNames.value = layers.map((l) => l.name)
}

// 根据当前选中列表，控制 dataSource.show
function applyLayerVisibility() {
  if (!viewer.value) return
  const namesSet = new Set(selectedLayerNames.value)

  geojsonLayers.value.forEach((layer) => {
    if (layer.dataSource) {
      layer.dataSource.show = namesSet.has(layer.name)
    }
  })
}

onMounted(async () => {
  if (!viewerContainer.value) return

  // 创建 Cesium Viewer
  viewer.value = createCesiumViewer(viewerContainer.value)

  // 自动生成图层列表
  initGeoJsonLayers()

  // 加载所有 GeoJSON（一次性加载，之后只控制 show 属性）
  for (const layer of geojsonLayers.value) {
    if (!viewer.value) break
    try {
      const ds = await loadGeoJson(viewer.value, layer.url)
      layer.dataSource = ds
      // 按当前选中状态设置显示
      ds.show = selectedLayerNames.value.includes(layer.name)
    } catch (e) {
      console.error('加载 GeoJSON 失败：', layer.url, e)
    }
  }

  // 创建点击选中处理器
  if (viewer.value) {
    selectionHandler = createSelectionHandler(viewer.value, {
      onSelected(info) {
        selectedInfo.value = info
      },
      onCleared() {
        selectedInfo.value = null
      },
    })
  }

  // 初始应用一次显隐（防止异步时机问题）
  applyLayerVisibility()
})

// 监听下拉多选的变化，更新图层显隐
watch(selectedLayerNames, () => {
  applyLayerVisibility()
})

function handleClearSelection() {
  selectedInfo.value = null
  selectionHandler?.clearSelection()
}

async function handleToggleClean() {
  const dataSources = geojsonLayers.value
    .map((layer) => layer.dataSource)
    .filter((ds): ds is Cesium.GeoJsonDataSource => !!ds)

  if (!viewer.value) return

  if (!isCleaned.value) {
    // 第一次点击：调用 Python，按 k 规则返回要隐藏的 entity.id
    try {
      const { idsToHide } = await requestCleanFromPython(viewer.value, dataSources, {
        kThreshold: 40,
      })

      const idSet = new Set(idsToHide)

      // 根据返回的 id 隐藏对应实体，并记录原 show 状态
      polygonHideRecords = []

      dataSources.forEach((ds) => {
        const entities = (ds as any).entities?.values as Cesium.Entity[] | undefined
        if (!entities) return

        entities.forEach((entity) => {
          const eid = String(entity.id)
          if (idSet.has(eid)) {
            polygonHideRecords.push({
              entity,
              show: entity.show,
            })
            entity.show = false
          }
        })
      })

      isCleaned.value = true
      handleClearSelection()
    } catch (e) {
      console.error(e)
    }
  } else {
    // 第二次点击：恢复
    polygonHideRecords.forEach(({ entity, show }) => {
      entity.show = show
    })
    polygonHideRecords = []
    isCleaned.value = false
  }
}


onBeforeUnmount(() => {
  if (selectionHandler) {
    selectionHandler.handler.destroy()
    selectionHandler = null
  }
  destroyCesiumViewer(viewer.value || undefined)
})
</script>

<style scoped>
.viewer-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* Cesium 容器 */
.viewer-container {
  width: 100%;
  height: 100%;
}

/* 左上角 GeoJSON 图层勾选面板 */
.geojson-select-panel {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 20;
  padding: 10px 12px;
  min-width: 220px;
  max-width: 260px;

  background: radial-gradient(
      circle at top left,
      rgba(74, 158, 255, 0.25),
      rgba(10, 18, 35, 0.96)
    );
  border-radius: 10px;
  border: 1px solid rgba(102, 204, 255, 0.4);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.55),
    0 0 16px rgba(102, 204, 255, 0.35);
  backdrop-filter: blur(12px);

  color: #e6f7ff;
  font-size: 12px;
}

/* 标题区域 */
.geojson-select-header {
  margin-bottom: 6px;
}

.select-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
}

.select-title::after {
  content: '';
  flex: 1;
  margin-left: 8px;
  height: 1px;
  background: linear-gradient(90deg, rgba(102, 204, 255, 0.9), transparent);
}

.select-subtitle {
  margin-top: 2px;
  font-size: 11px;
  opacity: 0.75;
  color: #a3d5ff;
}

/* 勾选列表 */
.geojson-checkbox-list {
  margin-top: 4px;
  max-height: 150px;
  overflow-y: auto;
  padding-right: 4px;
}

/* 单个勾选项 */
.checkbox-item {
  display: flex;
  align-items: center;
  padding: 4px 2px;
  border-radius: 4px;
  cursor: pointer;
  gap: 6px;
  transition:
    background 0.15s ease,
    transform 0.1s ease;
}

.checkbox-item:hover {
  background: rgba(40, 90, 150, 0.55);
  transform: translateX(1px);
}

/* 隐藏原生 checkbox，自己画一个 */
.checkbox-item input[type='checkbox'] {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid rgba(102, 204, 255, 0.7);
  background: rgba(3, 10, 20, 0.9);
  position: relative;
  cursor: pointer;
  outline: none;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
}

.checkbox-item input[type='checkbox']:checked {
  background: linear-gradient(135deg, #4a9eff, #66ccff);
  box-shadow:
    0 0 8px rgba(102, 204, 255, 0.9),
    0 0 0 1px rgba(10, 20, 40, 0.9);
  border-color: transparent;
}

.checkbox-item input[type='checkbox']:checked::after {
  content: '✔';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -58%);
  font-size: 10px;
  color: #02101f;
  font-weight: 700;
}

/* 勾选项文字 */
.checkbox-label {
  font-size: 12px;
  color: #e6f7ff;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

/* 滚动条美化 */
.geojson-checkbox-list::-webkit-scrollbar {
  width: 4px;
}

.geojson-checkbox-list::-webkit-scrollbar-track {
  background: rgba(26, 58, 107, 0.3);
}

.geojson-checkbox-list::-webkit-scrollbar-thumb {
  background: linear-gradient(to bottom, #4a9eff, #66ccff);
  border-radius: 2px;
}


/* 左侧信息面板 */
.info-panel {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 300px;
  max-height: 80vh;
  background: rgba(10, 26, 42, 0.85);
  backdrop-filter: blur(10px);
  border-radius: 8px;
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(74, 158, 255, 0.2),
    inset 0 0 20px rgba(74, 158, 255, 0.1);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(74, 158, 255, 0.3);
}

.info-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(
    90deg,
    rgba(26, 58, 107, 0.8) 0%,
    rgba(42, 82, 152, 0.8) 100%
  );
  border-bottom: 1px solid rgba(74, 158, 255, 0.3);
  position: relative;
}

.info-header::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(102, 204, 255, 0.8),
    transparent
  );
}

.info-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #e6f7ff;
  text-shadow: 0 0 10px rgba(102, 204, 255, 0.5);
}

.info-header button {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(102, 204, 255, 0.3);
  color: #66ccff;
  font-size: 18px;
  cursor: pointer;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.info-header button:hover {
  background: rgba(102, 204, 255, 0.2);
  border-color: #66ccff;
  box-shadow: 0 0 10px rgba(102, 204, 255, 0.5);
}

.info-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  background: rgba(5, 15, 25, 0.6);
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid rgba(74, 158, 255, 0.1);
}

.info-row:last-child {
  border-bottom: none;
}

.key {
  font-weight: 500;
  color: #a3d5ff;
  font-size: 13px;
  margin-right: 12px;
}

.value {
  text-align: right;
  color: #e6f7ff;
  font-size: 13px;
  word-break: break-word;
  max-width: 180px;
}

.info-content::-webkit-scrollbar {
  width: 4px;
}

.info-content::-webkit-scrollbar-track {
  background: rgba(26, 58, 107, 0.3);
}

.info-content::-webkit-scrollbar-thumb {
  background: linear-gradient(to bottom, #4a9eff, #66ccff);
  border-radius: 2px;
}

.info-content::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(to bottom, #66ccff, #88ddff);
}

/* 左下角清洗按钮 */
.clean-toggle-button {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 20;

  padding: 8px 14px;
  border-radius: 20px;
  border: 1px solid rgba(102, 204, 255, 0.7);
  background: radial-gradient(
      circle at top left,
      rgba(74, 158, 255, 0.35),
      rgba(5, 12, 24, 0.95)
    );
  color: #e6f7ff;
  font-size: 12px;
  cursor: pointer;

  box-shadow:
    0 4px 14px rgba(0, 0, 0, 0.6),
    0 0 10px rgba(102, 204, 255, 0.5);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  gap: 6px;
}

.clean-toggle-button:hover {
  border-color: #66ccff;
  box-shadow:
    0 0 0 1px rgba(102, 204, 255, 0.8),
    0 0 16px rgba(102, 204, 255, 0.9);
  transform: translateY(-1px);
}

.clean-toggle-button:active {
  transform: translateY(0);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.7),
    0 0 8px rgba(102, 204, 255, 0.7);
}

</style>