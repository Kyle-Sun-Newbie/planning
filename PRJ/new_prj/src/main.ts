import { createApp } from 'vue'
import App from './App.vue'

// Cesium 的 JS 和样式
import 'cesium/Build/Cesium/Widgets/widgets.css'

const app = createApp(App)
app.mount('#app')
