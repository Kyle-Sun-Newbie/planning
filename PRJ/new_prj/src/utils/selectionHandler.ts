// src/utils/selectionHandler.ts
import * as Cesium from 'cesium'

export interface SelectionInfo {
  name?: string
  properties: Record<string, any>
}

export interface SelectionCallbacks {
  onSelected: (info: SelectionInfo) => void
  onCleared?: () => void
}

/**
 * 创建点击选中处理器：
 * - 点击多边形高亮描边
 * - 再次点击同一块 / 点击空白处，取消选中
 */
export function createSelectionHandler(
  viewer: Cesium.Viewer,
  callbacks: SelectionCallbacks,
) {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)

  // 当前选中的实体
  let selectedEntity: Cesium.Entity | null = null

  // ✅ 预先准备好几种 Property，避免每次 new
  const defaultOutlineColorProp = new Cesium.ConstantProperty(Cesium.Color.fromCssColorString('#4a9eff').withAlpha(0.9),)
  const defaultOutlineWidthProp = new Cesium.ConstantProperty(1.5)
  const selectedOutlineColorProp = new Cesium.ConstantProperty(Cesium.Color.fromCssColorString('#00ffff').withAlpha(1.0),)
  const selectedOutlineWidthProp = new Cesium.ConstantProperty(3.5)

  const resetEntityStyle = (entity: Cesium.Entity) => {
    const polygon = entity.polygon
    if (!polygon) return

    polygon.outlineColor = defaultOutlineColorProp     // Property<Color>
    polygon.outlineWidth = defaultOutlineWidthProp     // Property<number>
  }

  const setEntitySelected = (entity: Cesium.Entity) => {
    const polygon = entity.polygon
    if (!polygon) return

    polygon.outlineColor = selectedOutlineColorProp
    polygon.outlineWidth = selectedOutlineWidthProp
  }

  const clearSelection = () => {
    if (selectedEntity) {
      resetEntityStyle(selectedEntity)
      selectedEntity = null
    }
    callbacks.onCleared && callbacks.onCleared()
  }

  handler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    const picked = viewer.scene.pick(click.position)
    const entity = picked?.id as Cesium.Entity | undefined

    if (entity?.polygon) {
      // 再次点击同一个区域 -> 取消选中
      if (entity === selectedEntity) {
        clearSelection()
        return
      }

      // 清除旧的
      if (selectedEntity) {
        resetEntityStyle(selectedEntity)
      }

      // 设置新的
      selectedEntity = entity
      setEntitySelected(entity)

      const props =
        entity.properties?.getValue(viewer.clock.currentTime) ?? ({} as Record<string, any>)

      callbacks.onSelected({
        name: (props.name as string) || (entity.name as string) || '区域',
        properties: props,
      })
    } else {
      // 点击空白区域
      clearSelection()
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  return {
    handler,
    clearSelection,
  }
}