# Routes

| URL | 组件 | 布局 |
| --- | --- | --- |
| `/` | `frontend/src/App.tsx` | 同文件中的 `main.panel` |
| `/pair?token=…` | `frontend/src/App.tsx` | 同文件中的 PWA 自动配对分支 |

项目没有 React Router；FastAPI 将未知页面回退到 PWA 入口。
