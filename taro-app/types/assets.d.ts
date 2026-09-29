// 静态资源模块声明
// Taro/webpack 能解析图片 import，但 tsc 需要显式声明才不报 TS2307。
// tabBar 与「我的」页图标均由 demo/user.html 的内联 SVG 渲染成 PNG，
// 存放于 src/assets/ 下。
declare module '*.png' {
  const src: string
  export default src
}

declare module '*.jpg' {
  const src: string
  export default src
}

declare module '*.jpeg' {
  const src: string
  export default src
}

declare module '*.gif' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}

declare module '*.webp' {
  const src: string
  export default src
}
