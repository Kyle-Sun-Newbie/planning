// src/utils/cesiumBase.ts
import * as Cesium from 'cesium'

/**
 * 创建并初始化一个 Cesium Viewer
 */
export function createCesiumViewer(container: HTMLElement): Cesium.Viewer {
  const viewer = new Cesium.Viewer(container, {
    baseLayerPicker: true,
    sceneModePicker: true,
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    selectionIndicator: false,
    infoBox: false,
    sceneMode: Cesium.SceneMode.SCENE2D,
  })

  // 背景色
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0a1a2a')

  // 隐藏默认版权信息
  ;(viewer.cesiumWidget.creditContainer as HTMLElement).style.display = 'none'

  // 初始飞到喀什附近
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(76.075, 39.435, 15000.0),
    duration: 1.5,
  })

  return viewer
}

/**
 * 销毁 Viewer（避免内存泄漏）
 */
export function destroyCesiumViewer(viewer?: Cesium.Viewer) {
  if (viewer && !viewer.isDestroyed()) {
    viewer.destroy()
  }
}
